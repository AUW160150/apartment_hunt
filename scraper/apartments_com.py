"""Apartments.com scraper using Playwright."""
import asyncio
import re
from typing import Optional
from playwright.async_api import async_playwright
from normalize import Listing, parse_price, parse_rooms, parse_sqft

CITY_URLS = {
    "New York City": "https://www.apartments.com/new-york-ny/",
    "San Francisco": "https://www.apartments.com/san-francisco-ca/",
}


async def scrape_city(city: str, max_listings: int = 50) -> list[Listing]:
    url = CITY_URLS.get(city)
    if not url:
        print(f"[apartments_com] No URL configured for {city}")
        return []

    listings: list[Listing] = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                       "AppleWebKit/537.36 (KHTML, like Gecko) "
                       "Chrome/120.0.0.0 Safari/537.36",
        )
        page = await context.new_page()

        try:
            await page.goto(url, wait_until="networkidle", timeout=30000)
            await page.wait_for_timeout(2000)

            cards = await page.query_selector_all(".placard")
            print(f"[apartments_com] Found {len(cards)} cards for {city}")

            for card in cards[:max_listings]:
                listing = await _parse_card(card, city)
                if listing:
                    listings.append(listing)

        except Exception as e:
            print(f"[apartments_com] Error scraping {city}: {e}")
        finally:
            await browser.close()

    print(f"[apartments_com] Extracted {len(listings)} listings for {city}")
    return listings


async def _parse_card(card, city: str) -> Optional[Listing]:
    try:
        title_el = await card.query_selector(".property-title")
        title = await title_el.inner_text() if title_el else None

        addr_el = await card.query_selector(".property-address")
        address = await addr_el.inner_text() if addr_el else None
        if address:
            address = address.strip()

        price_el = await card.query_selector(".property-pricing")
        price_text = await price_el.inner_text() if price_el else ""
        price = parse_price(price_text)

        info_el = await card.query_selector(".property-beds")
        info_text = await info_el.inner_text() if info_el else ""
        rooms = parse_rooms(info_text)
        sqft = parse_sqft(info_text)

        link_el = await card.query_selector("a.property-link")
        url = await link_el.get_attribute("href") if link_el else None

        imgs = await card.query_selector_all("img.carousel-image")
        photo_urls = []
        for img in imgs[:5]:
            src = await img.get_attribute("src")
            if src:
                photo_urls.append(src)

        amenities_el = await card.query_selector(".property-amenities")
        amenities_text = await amenities_el.inner_text() if amenities_el else ""
        amenities = [a.strip().lower() for a in amenities_text.split("·") if a.strip()]

        external_id = re.sub(r"[^a-z0-9]", "-", (url or address or title or "").lower())[:80]

        if not price and not address:
            return None

        return Listing(
            source="apartments_com",
            external_id=external_id,
            title=title,
            price=price,
            rooms=rooms,
            address=address,
            sqft=sqft,
            has_photos=len(photo_urls) > 0,
            photo_urls=photo_urls,
            amenities=amenities,
            url=url,
            raw_data={"city": city, "info": info_text, "price_raw": price_text},
        )
    except Exception as e:
        print(f"[apartments_com] Error parsing card: {e}")
        return None
