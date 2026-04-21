"""India pincode lookup/validation using the public India Post API.

Results are cached in-process to reduce latency and rate-limit risk.
If the API is unreachable (dev/offline), we fall back to a pure-format
check (6 digits, first digit 1-9) so the UI remains usable.
"""
from __future__ import annotations

import logging
import re
import time
from typing import Optional, TypedDict

import httpx

logger = logging.getLogger(__name__)

PINCODE_API = "https://api.postalpincode.in/pincode/{code}"
PINCODE_REGEX = re.compile(r"^[1-9]\d{5}$")
CACHE_TTL_SECONDS = 60 * 60 * 24  # 24h


class PincodeInfo(TypedDict):
    pincode: str
    valid: bool
    city: Optional[str]
    state: Optional[str]
    district: Optional[str]


_cache: dict[str, tuple[float, PincodeInfo]] = {}


def _is_syntactically_valid(pincode: str) -> bool:
    return bool(PINCODE_REGEX.match(pincode or ""))


async def lookup_pincode(pincode: str) -> PincodeInfo:
    """Return structured info for a pincode.

    ``valid`` is True only if the pincode is both well-formed AND resolvable
    via India Post. If the upstream API is unreachable, ``valid`` falls back
    to the format check.
    """
    pincode = (pincode or "").strip()
    if not _is_syntactically_valid(pincode):
        return {"pincode": pincode, "valid": False, "city": None, "state": None, "district": None}

    cached = _cache.get(pincode)
    if cached and time.time() - cached[0] < CACHE_TTL_SECONDS:
        return cached[1]

    info: PincodeInfo = {"pincode": pincode, "valid": True, "city": None, "state": None, "district": None}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(PINCODE_API.format(code=pincode))
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, list) and data and data[0].get("Status") == "Success":
                post_offices = data[0].get("PostOffice") or []
                if post_offices:
                    first = post_offices[0]
                    info["city"] = first.get("District") or first.get("Name")
                    info["state"] = first.get("State")
                    info["district"] = first.get("District")
                    info["valid"] = True
                else:
                    info["valid"] = False
            else:
                info["valid"] = False
    except Exception as exc:  # network / timeout / parse
        logger.warning("Pincode lookup failed for %s (falling back to format check): %s", pincode, exc)
        # Keep format-based validity; city/state remain None.

    _cache[pincode] = (time.time(), info)
    return info
