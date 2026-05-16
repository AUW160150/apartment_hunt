"""Common listing schema — every scraper outputs this shape."""
from dataclasses import dataclass, field
from typing import Optional
import re


@dataclass
class Listing:
    source: str                          # 'zillow' | 'apartments_com' | 'fb' | 'hog'
    external_id: str
    title: Optional[str] = None
    price: Optional[int] = None          # monthly USD
    rooms: int = 1
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    sqft: Optional[int] = None
    has_photos: bool = False
    photo_urls: list[str] = field(default_factory=list)
    amenities: list[str] = field(default_factory=list)
    url: Optional[str] = None
    contact_email: Optional[str] = None
    contact_name: Optional[str] = None
    raw_data: dict = field(default_factory=dict)

    def to_db_row(self) -> dict:
        from scam_detect import detect_scam_flags
        flags = detect_scam_flags(self)
        return {
            "source": self.source,
            "external_id": self.external_id,
            "title": self.title,
            "price": self.price,
            "rooms": self.rooms,
            "address": self.address,
            "lat": self.lat,
            "lng": self.lng,
            "sqft": self.sqft,
            "has_photos": self.has_photos,
            "photo_urls": self.photo_urls,
            "amenities": self.amenities,
            "url": self.url,
            "contact_email": self.contact_email,
            "contact_name": self.contact_name,
            "is_flagged_scam": len(flags) > 0,
            "scam_flags": flags,
            "raw_data": self.raw_data,
        }

    def to_embed_text(self) -> str:
        """Text representation for ZeroEntropy zembed-1."""
        parts = [
            self.title or "Apartment listing",
            f"at {self.address}" if self.address else "",
            f"${self.price}/month" if self.price else "",
            f"{self.rooms} bedroom" if self.rooms else "",
            f"{self.sqft} sqft" if self.sqft else "",
            f"amenities: {', '.join(self.amenities)}" if self.amenities else "",
            "has photos" if self.has_photos else "no photos listed",
            f"source: {self.source}",
        ]
        return ". ".join(p for p in parts if p)


def parse_price(text: str) -> Optional[int]:
    """Extract monthly rent from a string like '$2,500/mo' or '2500'."""
    if not text:
        return None
    cleaned = re.sub(r"[^\d]", "", text.split("/")[0].split("per")[0])
    return int(cleaned) if cleaned else None


def parse_rooms(text: str) -> int:
    """Extract bedroom count from text like '2 bd', '1 bed', 'Studio'."""
    if not text:
        return 1
    if "studio" in text.lower():
        return 1
    match = re.search(r"(\d+)\s*(?:bd|bed|bedroom)", text.lower())
    return int(match.group(1)) if match else 1


def parse_sqft(text: str) -> Optional[int]:
    match = re.search(r"(\d[\d,]*)\s*(?:sq\s*ft|sqft)", text.lower())
    if match:
        return int(match.group(1).replace(",", ""))
    return None
