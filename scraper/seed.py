"""
Entry point: scrape → normalize → upsert to Supabase → embed with ZeroEntropy.

Usage:
  python seed.py --cities "New York City" "San Francisco" --max 100
"""
import asyncio
import argparse
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

import zillow
import apartments_com
import fb_groups as fb
import hog_listener
from embed import embed_and_store
from normalize import Listing

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

CITIES = ["New York City", "San Francisco"]


def upsert_listing(listing: Listing) -> str | None:
    """Upsert a listing and return its DB id."""
    row = listing.to_db_row()
    try:
        result = (
            sb.table("listings")
            .upsert(row, on_conflict="source,external_id")
            .execute()
        )
        return result.data[0]["id"] if result.data else None
    except Exception as e:
        print(f"[seed] Upsert failed for {listing.source}/{listing.external_id}: {e}")
        return None


async def seed_city(city: str, max_per_source: int) -> int:
    print(f"\n=== Seeding {city} ===")
    all_listings: list[Listing] = []

    # Seed FB groups (curated list)
    fb.seed_known_groups(city)

    # Scrape all listing sources
    zillow_listings = await zillow.scrape_city(city, max_per_source)
    apts_listings = await apartments_com.scrape_city(city, max_per_source)
    hog_count = await hog_listener.seed_city(city)
    print(f"[seed] {city}: Hog seeded {hog_count} social listings")
    all_listings = zillow_listings + apts_listings

    print(f"[seed] {city}: {len(all_listings)} total listings scraped")

    # Upsert + embed
    embedded = 0
    for listing in all_listings:
        listing_id = upsert_listing(listing)
        if listing_id:
            ok = embed_and_store(listing_id, listing)
            if ok:
                embedded += 1

    print(f"[seed] {city}: {embedded}/{len(all_listings)} listings embedded")
    return len(all_listings)


async def main(cities: list[str], max_per_source: int):
    total = 0
    for city in cities:
        total += await seed_city(city, max_per_source)
    print(f"\n[seed] Done. Total listings processed: {total}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--cities", nargs="+", default=CITIES)
    parser.add_argument("--max", type=int, default=100, help="Max listings per source per city")
    args = parser.parse_args()
    asyncio.run(main(args.cities, args.max))
