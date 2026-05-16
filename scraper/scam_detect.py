"""Scam detection heuristics applied at scrape time."""
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from normalize import Listing

WIRE_TRANSFER_TERMS = ["wire transfer", "western union", "moneygram", "zelle only", "cash only"]
OVERSEAS_TERMS = ["overseas", "out of country", "abroad", "missionary", "deployed"]


def detect_scam_flags(listing: "Listing") -> list[str]:
    flags = []
    raw_text = str(listing.raw_data).lower()

    if not listing.has_photos or not listing.photo_urls:
        flags.append("no_photos")

    if not listing.address:
        flags.append("no_address")

    if listing.price and listing.price < 750:
        # Suspiciously cheap for NYC/SF
        flags.append("price_too_low")

    if any(term in raw_text for term in WIRE_TRANSFER_TERMS):
        flags.append("wire_transfer_request")

    if any(term in raw_text for term in OVERSEAS_TERMS):
        flags.append("overseas_landlord")

    return flags
