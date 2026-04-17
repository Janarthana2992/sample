import logging
from typing import Any, Dict, List, Optional

from elasticsearch import AsyncElasticsearch, NotFoundError
from app.config import settings

logger = logging.getLogger(__name__)

INDEX_NAME = settings.ES_INDEX or settings.ES_INDEX_NAME

PRODUCT_MAPPING = {
    "mappings": {
        "properties": {
            "product_id": {"type": "keyword"},
            "name": {"type": "text", "analyzer": "english", "fields": {"keyword": {"type": "keyword"}}},
            "description": {"type": "text", "analyzer": "english"},
            "sku": {"type": "keyword"},
            "category_ids": {"type": "keyword"},
            "tags": {"type": "keyword"},
            "mrp": {"type": "double"},
            "selling_price": {"type": "double"},
            "rating": {"type": "float"},
            "review_count": {"type": "integer"},
            "bayesian_rating": {"type": "float"},
            "stock_status": {"type": "keyword"},
            "is_active": {"type": "boolean"},
            "sales_count": {"type": "integer"},
            "image_url": {"type": "keyword", "index": False},
            "category_names": {"type": "text", "analyzer": "english"},
        }
    },
    "settings": {
        "number_of_shards": 1,
        "number_of_replicas": 0,
    },
}


class ElasticsearchService:
    def __init__(self):
        if settings.ES_API_KEY:
            # Elastic Cloud
            self.client = AsyncElasticsearch(
                settings.ES_ENDPOINT,
                api_key=settings.ES_API_KEY,
                verify_certs=True,
            )
        else:
            # Local / development fallback
            self.client = AsyncElasticsearch([settings.ES_ENDPOINT])

    async def setup_index(self):
        """Create index if it doesn't exist."""
        try:
            exists = await self.client.indices.exists(index=INDEX_NAME)
            if not exists:
                await self.client.indices.create(index=INDEX_NAME, body=PRODUCT_MAPPING)
                logger.info("Created Elasticsearch index: %s", INDEX_NAME)
        except Exception as exc:
            logger.error("Failed to setup Elasticsearch index: %s", exc)

    async def index_product(self, doc: Dict[str, Any]) -> bool:
        try:
            await self.client.index(index=INDEX_NAME, id=doc["product_id"], body=doc)
            return True
        except Exception as exc:
            logger.error("Failed to index product %s: %s", doc.get("product_id"), exc)
            return False

    async def delete_product(self, product_id: str) -> bool:
        try:
            await self.client.delete(index=INDEX_NAME, id=product_id, ignore=[404])
            return True
        except Exception as exc:
            logger.error("Failed to delete product %s from ES: %s", product_id, exc)
            return False

    async def search(
        self,
        query: str,
        page: int = 1,
        size: int = 20,
        filters: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        from_ = (page - 1) * size
        must_clauses: List[Dict] = [{"term": {"is_active": True}}]
        should_clauses: List[Dict] = []

        if query:
            should_clauses = [
                # Name: up to 2 character edits, first 2 chars must match exactly
                {"match": {"name": {"query": query, "boost": 4, "fuzziness": 2, "prefix_length": 2, "max_expansions": 30}}},
                # Description: exact match only (no fuzziness — field is too long)
                {"match": {"description": {"query": query, "boost": 1}}},
                # Tags: exact keyword match
                {"match": {"tags": {"query": query, "boost": 3}}},
                # Category names: fuzziness 1 handles singular/plural (smartphone→smartphones)
                {"match": {"category_names": {"query": query, "boost": 3, "fuzziness": 1}}},
            ]

        if filters:
            if filters.get("categories"):
                # category_names is a text field; use match queries so name strings work
                cat_should = [
                    {"match": {"category_names": {"query": cat, "operator": "and"}}}
                    for cat in filters["categories"]
                ]
                must_clauses.append({"bool": {"should": cat_should, "minimum_should_match": 1}})
            if filters.get("min_price") is not None or filters.get("max_price") is not None:
                price_range: Dict = {}
                if filters.get("min_price") is not None:
                    price_range["gte"] = float(filters["min_price"])
                if filters.get("max_price") is not None:
                    price_range["lte"] = float(filters["max_price"])
                must_clauses.append({"range": {"selling_price": price_range}})
            if filters.get("min_rating") is not None:
                must_clauses.append({"range": {"rating": {"gte": filters["min_rating"]}}})
            if filters.get("in_stock_only"):
                must_clauses.append(
                    {"terms": {"stock_status": ["in_stock", "low_stock"]}}
                )
            if filters.get("deals_only"):
                must_clauses.append(
                    {"script": {"script": "doc['mrp'].value > doc['selling_price'].value"}}
                )

        es_query: Dict[str, Any] = {
            "bool": {
                "must": must_clauses,
            }
        }
        if should_clauses:
            es_query["bool"]["should"] = should_clauses
            es_query["bool"]["minimum_should_match"] = 1

        body = {
            "query": es_query,
            "sort": [
                "_score",
                {"sales_count": {"order": "desc"}},
            ],
            "from": from_,
            "size": size,
        }

        # "Did you mean" term suggester
        if query:
            body["suggest"] = {
                "did_you_mean": {
                    "text": query,
                    "term": {
                        "field": "name",
                        "suggest_mode": "always",
                        "min_word_length": 3,
                        "max_edits": 2,
                    },
                }
            }

        try:
            response = await self.client.search(index=INDEX_NAME, body=body)
            hits = response["hits"]

            # Parse suggest response into a corrected query string
            suggestion = None
            if query and "suggest" in response:
                tokens = response["suggest"].get("did_you_mean", [])
                corrected, changed = [], False
                for token in tokens:
                    if token["options"]:
                        corrected.append(token["options"][0]["text"])
                        changed = True
                    else:
                        corrected.append(token["text"])
                if changed:
                    candidate = " ".join(corrected)
                    if candidate.lower() != query.lower():
                        suggestion = candidate

            return {
                "total": hits["total"]["value"],
                "hits": [
                    {**h["_source"], "score": h["_score"]}
                    for h in hits["hits"]
                ],
                "suggestion": suggestion,
            }
        except Exception as exc:
            logger.error("Elasticsearch search error: %s", exc)
            return {"total": 0, "hits": [], "suggestion": None}

    async def autocomplete(self, query: str, size: int = 8) -> List[str]:
        if not query:
            return []
        # Primary: phrase-prefix (fast, exact prefix match)
        prefix_body = {
            "query": {
                "bool": {
                    "must": [
                        {"match_phrase_prefix": {"name": {"query": query, "max_expansions": 20}}},
                        {"term": {"is_active": True}},
                    ]
                }
            },
            "_source": ["name"],
            "size": size,
        }
        try:
            response = await self.client.search(index=INDEX_NAME, body=prefix_body)
            hits = [h["_source"]["name"] for h in response["hits"]["hits"]]
            if len(hits) >= 2:
                return hits
            # Fallback: fuzzy multi_match for typos/misspellings
            fuzzy_body = {
                "query": {
                    "bool": {
                        "must": [
                            {
                                "multi_match": {
                                    "query": query,
                                    "fields": ["name^3", "tags^2", "category_names"],
                                    "fuzziness": "AUTO",
                                    "prefix_length": 1,
                                }
                            },
                            {"term": {"is_active": True}},
                        ]
                    }
                },
                "_source": ["name"],
                "size": size,
            }
            fuzzy_response = await self.client.search(index=INDEX_NAME, body=fuzzy_body)
            return [h["_source"]["name"] for h in fuzzy_response["hits"]["hits"]]
        except Exception as exc:
            logger.error("Elasticsearch autocomplete error: %s", exc)
            return []

    async def top_rated(self, category: Optional[str] = None, size: int = 10) -> Dict[str, Any]:
        """Return products sorted by bayesian_rating (which penalises few reviews)."""
        must = [
            {"term": {"is_active": True}},
            {"range": {"review_count": {"gte": 1}}},  # at least 1 review
        ]
        if category:
            must.append({"match": {"category_names": {"query": category, "operator": "and"}}})

        body = {
            "query": {"bool": {"must": must}},
            "sort": [
                {"bayesian_rating": {"order": "desc"}},
                {"review_count": {"order": "desc"}},
            ],
            "size": size,
        }
        try:
            response = await self.client.search(index=INDEX_NAME, body=body)
            hits = response["hits"]
            return {
                "total": hits["total"]["value"],
                "hits": [{**h["_source"], "score": 0} for h in hits["hits"]],
            }
        except Exception as exc:
            logger.error("Elasticsearch top_rated error: %s", exc)
            return {"total": 0, "hits": []}

    async def close(self):
        await self.client.close()


es_service = ElasticsearchService()
