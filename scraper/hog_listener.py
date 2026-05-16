"""
The Hog web intelligence integration.
Monitors social platforms (Reddit, X, forums) for housing signals in target cities.
Converts social posts into Listing objects and seeds Supabase.
"""
import os
import re
import httpx
from normalize import Listing, parse_price
from supabase import create_client

HOG_API_KEY = os.environ.get("HOG_API_KEY", "")
HOG_API_SECRET = os.environ.get("HOG_API_SECRET", "")
HOG_BASE_URL = "https://api.thehog.ai/v1"

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

CITY_SEARCH_TERMS = {
    "New York City": [
        "NYC apartment for rent",
        "New York room for rent",
        "NYC sublet",
        "Manhattan apartment available",
        "Brooklyn room available",
        "Astoria apartment rent",
        "Hoboken room for rent",
    ],
    "San Francisco": [
        "San Francisco apartment for rent",
        "SF room for rent",
        "Bay Area sublet",
        "Oakland apartment available",
        "SF housing available",
    ],
}


async def fetch_hog_signals(city: str, query: str) -> list[dict]:
    """Call The Hog API to find housing-related social posts."""
    if not HOG_API_KEY:
        print("[hog] No HOG_API_KEY set — skipping")
        return []

    async with httpx.AsyncClient(timeout=30) as client:
        try:
            response = await client.post(
                f"{HOG_BASE_URL}/search",
                headers={
                    "Authorization": f"Bearer {HOG_API_SECRET}",
                    "X-API-Key": HOG_API_KEY,
                },
                json={
                    "query": query,
                    "sources": ["reddit", "twitter", "forums"],
                    "max_results": 20,
                    "filters": {"intent": "housing_offer"},
                },
            )
            if response.status_code == 200:
                return response.json().get("results", [])
            else:
                print(f"[hog] API error {response.status_code}: {response.text[:200]}")
                return []
        except Exception as e:
            print(f"[hog] Request failed: {e}")
            return []


def hog_result_to_listing(result: dict, city: str) -> Listing | None:
    """Convert a Hog API result to a Listing object."""
    text = result.get("text", "") or result.get("content", "")
    url = result.get("url", "") or result.get("link", "")
    source_platform = result.get("source", "reddit")

    # Try to extract a price
    price = parse_price(text)
    if not price:
        # Look for price patterns in text
        match = re.search(r"\$\s*(\d{3,4})\s*(?:/mo|per month|monthly)?", text)
        if match:
            price = int(match.group(1))

    if not price:
        return None  # Skip posts with no price signal

    # Extract bedroom count
    rooms = 1
    room_match = re.search(r"(\d)\s*(?:bd|bed|bedroom|br)\b", text.lower())
    if room_match:
        rooms = int(room_match.group(1))
    elif "studio" in text.lower():
        rooms = 1

    # Check for photo mentions
    has_photos = any(word in text.lower() for word in ["photo", "pic", "image", "gallery"])

    external_id = re.sub(r"[^a-z0-9]", "-", url.lower())[:80] or f"hog-{hash(text)}"

    return Listing(
        source="hog",
        external_id=external_id,
        title=text[:100].strip(),
        price=price,
        rooms=rooms,
        has_photos=has_photos,
        photo_urls=[],
        url=url,
        raw_data={
            "city": city,
            "platform": source_platform,
            "full_text": text,
            "author": result.get("author"),
            "posted_at": result.get("published_at"),
        },
    )


async def seed_city(city: str) -> int:
    """Fetch Hog signals for all search terms in a city and seed Supabase."""
    terms = CITY_SEARCH_TERMS.get(city, [])
    all_listings: list[Listing] = []

    for term in terms:
        results = await fetch_hog_signals(city, term)
        for r in results:
            listing = hog_result_to_listing(r, city)
            if listing:
                all_listings.append(listing)

    # Deduplicate by URL
    seen_urls: set[str] = set()
    unique_listings = []
    for l in all_listings:
        if l.url and l.url not in seen_urls:
            seen_urls.add(l.url)
            unique_listings.append(l)

    # Upsert to Supabase
    count = 0
    for listing in unique_listings:
        try:
            sb.table("listings").upsert(
                listing.to_db_row(), on_conflict="source,external_id"
            ).execute()
            count += 1
        except Exception as e:
            print(f"[hog] Upsert failed: {e}")

    print(f"[hog] Seeded {count} listings for {city}")
    return count


if __name__ == "__main__":
    import asyncio
    for city in ["New York City", "San Francisco"]:
        asyncio.run(seed_city(city))
