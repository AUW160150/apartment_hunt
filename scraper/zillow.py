"""Zillow scraper using Playwright."""
import asyncio
import json
import re
from typing import Optional
from playwright.async_api import async_playwright, Page
from normalize import Listing, parse_price, parse_rooms, parse_sqft

CITY_URLS = {
    "New York City": "https://www.zillow.com/new-york-ny/rentals/",
    "San Francisco": "https://www.zillow.com/san-francisco-ca/rentals/",
}


async def scrape_city(city: str, max_listings: int = 50) -> list[Listing]:
    url = CITY_URLS.get(city)
    if not url:
        print(f"[zillow] No URL configured for {city}")
        return []

    listings: list[Listing] = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                       "AppleWebKit/537.36 (KHTML, like Gecko) "
                       "Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800},
        )
        page = await context.new_page()

        try:
            await page.goto(url, wait_until="networkidle", timeout=30000)
            await page.wait_for_timeout(2000)

            # Extract listing cards
            cards = await page.query_selector_all("[data-test='property-card']")
            print(f"[zillow] Found {len(cards)} cards for {city}")

            for card in cards[:max_listings]:
                listing = await _parse_card(card, city)
                if listing:
                    listings.append(listing)

        except Exception as e:
            print(f"[zillow] Error scraping {city}: {e}")
        finally:
            await browser.close()

    print(f"[zillow] Extracted {len(listings)} listings for {city}")
    return listings


async def _parse_card(card, city: str) -> Optional[Listing]:
    try:
        # Price
        price_el = await card.query_selector("[data-test='property-card-price']")
        price_text = await price_el.inner_text() if price_el else ""
        price = parse_price(price_text)

        # Address
        addr_el = await card.query_selector("address")
        address = await addr_el.inner_text() if addr_el else None
        if address:
            address = address.strip().replace("\n", ", ")

        # Details (beds, sqft)
        details_el = await card.query_selector("[data-test='property-card-details']")
        details_text = await details_el.inner_text() if details_el else ""
        rooms = parse_rooms(details_text)
        sqft = parse_sqft(details_text)

        # Photos
        imgs = await card.query_selector_all("img")
        photo_urls = []
        for img in imgs[:5]:
            src = await img.get_attribute("src")
            if src and "photos" in src:
                photo_urls.append(src)

        # Link
        link_el = await card.query_selector("a[href*='/homedetails/']")
        href = await link_el.get_attribute("href") if link_el else None
        url = f"https://www.zillow.com{href}" if href and href.startswith("/") else href

        # External ID from URL
        zpid_match = re.search(r"(\d+)_zpid", url or "")
        external_id = zpid_match.group(1) if zpid_match else (address or price_text)

        if not price and not address:
            return None

        # Amenities from details text
        amenities = []
        for keyword in ["laundry", "parking", "pets", "gym", "doorman", "dishwasher", "balcony"]:
            if keyword in details_text.lower():
                amenities.append(keyword)

        return Listing(
            source="zillow",
            external_id=external_id or f"zillow-{hash(url)}",
            title=f"{rooms}BR in {city}" + (f" - ${price}/mo" if price else ""),
            price=price,
            rooms=rooms,
            address=address,
            sqft=sqft,
            has_photos=len(photo_urls) > 0,
            photo_urls=photo_urls,
            amenities=amenities,
            url=url,
            raw_data={"city": city, "details": details_text, "price_raw": price_text},
        )
    except Exception as e:
        print(f"[zillow] Error parsing card: {e}")
        return None
