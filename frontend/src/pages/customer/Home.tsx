import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { productService } from '../../services/products'
import { aiClient } from '../../services/api'
import { ProductCard } from '../../components/common/ProductCard'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import { useAuthStore } from '../../store/authStore'
import { getViewedProducts } from './ProductDetail'

// ── Read recently tracked searches ───────────────────────────
function getRecentSearches(): string[] {
    try {
        const raw = localStorage.getItem('sp_recent_searches')
        return raw ? JSON.parse(raw) : []
    } catch { return [] }
}

type RecommendationCardItem = {
    product_id: string
    score: number
    name?: string
    mrp?: number
    selling_price?: number
    image_url?: string
    stock_status?: string
}

const FEATURED_PAGE_SIZE = 8
const FEATURED_ROTATION_MS = 8000

function mixRecommendations(primary: RecommendationCardItem[], secondary: RecommendationCardItem[], limit = 12) {
    const items: RecommendationCardItem[] = []
    const seen = new Set<string>()

    const push = (item?: RecommendationCardItem) => {
        if (!item || seen.has(item.product_id)) return
        seen.add(item.product_id)
        items.push(item)
    }

    const maxLen = Math.max(primary.length, secondary.length)
    for (let index = 0; index < maxLen && items.length < limit; index++) {
        push(primary[index])
        push(secondary[index])
    }

    return items
}

export default function Home() {
    const { user } = useAuthStore()
    const recentViews = getViewedProducts()
    const recentSearches = getRecentSearches()
    const [featuredPage, setFeaturedPage] = useState(1)

    const { data: featuredData, isLoading: isFeaturedLoading } = useQuery({
        queryKey: ['products', 'featured', featuredPage],
        queryFn: () => productService.listFeatured(featuredPage, FEATURED_PAGE_SIZE),
        placeholderData: previousData => previousData,
    })

    const featuredProducts = featuredData?.items ?? []
    const totalFeaturedPages = Math.max(1, Math.ceil((featuredData?.total ?? 0) / FEATURED_PAGE_SIZE))

    useEffect(() => {
        setFeaturedPage(currentPage => Math.min(currentPage, totalFeaturedPages))
    }, [totalFeaturedPages])

    useEffect(() => {
        if (totalFeaturedPages <= 1) return
        const rotationId = window.setInterval(() => {
            setFeaturedPage(currentPage => currentPage >= totalFeaturedPages ? 1 : currentPage + 1)
        }, FEATURED_ROTATION_MS)
        return () => window.clearInterval(rotationId)
    }, [totalFeaturedPages])

    const { data: recommendations } = useQuery({
        queryKey: ['recommendations', user?.user_id, ...recentViews.slice(0, 5), ...recentSearches.slice(0, 3)],
        queryFn: async () => {
            const recentSearchTerms = recentSearches.slice(0, 3)
            const searchBasedGroups = await Promise.all(
                recentSearchTerms.map(async term => {
                    try {
                        const response = await productService.search(term, 1, 4)
                        return (response.hits || []).map(hit => ({
                            product_id: hit.product_id,
                            score: hit.score,
                            name: hit.name,
                            mrp: hit.mrp,
                            selling_price: hit.selling_price,
                            image_url: hit.image_url,
                            stock_status: hit.stock_status,
                        }))
                    } catch {
                        return [] as RecommendationCardItem[]
                    }
                })
            )

            const searchBased: RecommendationCardItem[] = []
            const seenSearchIds = new Set<string>()
            const maxSearchDepth = Math.max(0, ...searchBasedGroups.map(group => group.length))
            for (let depth = 0; depth < maxSearchDepth; depth++) {
                for (const group of searchBasedGroups) {
                    const item = group[depth]
                    if (!item || seenSearchIds.has(item.product_id)) continue
                    seenSearchIds.add(item.product_id)
                    searchBased.push(item)
                }
            }

            let viewBased: RecommendationCardItem[] = []
            if (recentViews.length > 0) {
                try {
                    const response = await aiClient.get('/recommend/interest', {
                        params: { product_ids: recentViews.slice(0, 8).join(','), top_n: 8 },
                    })
                    viewBased = response.data.items || []
                } catch {
                    viewBased = []
                }
            }

            const blended = mixRecommendations(searchBased, viewBased, 12)
            if (blended.length > 0) return blended

            // Signal 3: purchase history (logged-in users)
            if (user) {
                try {
                    const r = await aiClient.get(`/recommend/user/${user.user_id}`, { params: { top_n: 8 } })
                    if (r.data.items?.length > 0) return r.data.items
                } catch { /* fallthrough */ }
            }

            // Fallback: trending by sales
            const r = await aiClient.get('/recommend/products', { params: { top_n: 8 } })
            return r.data.items
        },
        staleTime: 0,
        gcTime: 60_000,
    })

    const recLabel = (() => {
        if (recentViews.length > 0 && recentSearches.length > 0) return 'Based on Your Recent Searches & Views'
        if (recentViews.length > 0) return 'Based on Your Recent Views'
        if (recentSearches.length > 0) return 'Based on Your Recent Searches'
        return 'Recommended for You'
    })()

    return (
        <div className="space-y-12">
            {/* Hero */}
            <section className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-2xl text-white p-10 text-center">
                <h1 className="text-4xl font-extrabold mb-4">Welcome to ShopHere</h1>
                <p className="text-blue-100 text-lg mb-6">Discover amazing products at unbeatable prices</p>
                <Link to="/products" className="inline-block bg-white text-blue-700 font-bold px-8 py-3 rounded-xl hover:bg-blue-50 transition-colors">
                    Shop Now
                </Link>
            </section>

            {/* Recommended */}
            {recommendations && recommendations.length > 0 && (
                <section>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{recLabel}</h2>
                    <div className="flex gap-4 overflow-x-auto pb-2">
                        {recommendations.map((rec: any) => (
                            <Link
                                key={rec.product_id}
                                to={`/products/${rec.product_id}`}
                                className="shrink-0 w-44 bg-white rounded-xl border border-gray-200 hover:shadow-md transition-shadow overflow-hidden"
                            >
                                <div className="w-full aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                                    {rec.image_url
                                        ? <img src={rec.image_url} alt={rec.name} className="w-full h-full object-cover" />
                                        : <span className="text-4xl">📦</span>
                                    }
                                </div>
                                <div className="p-2">
                                    <p className="text-xs font-semibold text-gray-800 line-clamp-2 leading-snug mb-1">{rec.name || 'View Product'}</p>
                                    {rec.selling_price && (
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-sm font-bold text-gray-900">₹{Number(rec.selling_price).toLocaleString('en-IN')}</span>
                                            {rec.mrp && rec.mrp > rec.selling_price && (
                                                <span className="text-xs text-gray-400 line-through">₹{Number(rec.mrp).toLocaleString('en-IN')}</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            {/* Featured Products */}
            <section>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Featured Products</h2>
                        {totalFeaturedPages > 1 && (
                            <p className="text-sm text-gray-500 mt-1">Auto-rotating through featured and promoted picks</p>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        {totalFeaturedPages > 1 && (
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                                <button
                                    type="button"
                                    onClick={() => setFeaturedPage(currentPage => currentPage <= 1 ? totalFeaturedPages : currentPage - 1)}
                                    className="w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:text-blue-600 transition-colors"
                                    aria-label="Show previous featured products"
                                >
                                    ‹
                                </button>
                                <span>Page {featuredPage} of {totalFeaturedPages}</span>
                                <button
                                    type="button"
                                    onClick={() => setFeaturedPage(currentPage => currentPage >= totalFeaturedPages ? 1 : currentPage + 1)}
                                    className="w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:text-blue-600 transition-colors"
                                    aria-label="Show next featured products"
                                >
                                    ›
                                </button>
                            </div>
                        )}
                        <Link to="/products" className="text-blue-600 text-sm hover:underline">View all →</Link>
                    </div>
                </div>
                {isFeaturedLoading && !featuredData ? (
                    <LoadingSpinner />
                ) : featuredProducts.length === 0 ? (
                    <p className="text-sm text-gray-500">No featured or promoted products are available yet.</p>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {featuredProducts.map(p => <ProductCard key={p.product_id} product={p} />)}
                    </div>
                )}
            </section>
        </div>
    )
}
