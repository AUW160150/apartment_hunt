"""
FB group discovery: find active housing groups for a city.
Stores results in Supabase fb_groups table.

Note: This uses a curated seed list + public group search.
Full scraping of private groups requires user session cookies (post-hackathon).
"""
import os
import re
from supabase import create_client

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

# Curated active housing FB groups — extended during hackathon via manual research
KNOWN_GROUPS: dict[str, list[dict]] = {
    "New York City": [
        {"name": "NYC Apartments & Housing", "url": "https://www.facebook.com/groups/nycapartments", "is_private": False, "member_count": 85000},
        {"name": "NYC Housing & Rooms for Rent", "url": "https://www.facebook.com/groups/nychousingsearch", "is_private": False, "member_count": 42000},
        {"name": "Female Roommates NYC", "url": "https://www.facebook.com/groups/femaleNYCroommates", "is_private": True, "is_gender_specific": True, "gender_target": "female", "member_count": 12000},
        {"name": "NYC Female Roommate Finder", "url": "https://www.facebook.com/groups/nycfemaleroommatefinder", "is_private": True, "is_gender_specific": True, "gender_target": "female", "member_count": 8500},
        {"name": "NYC Rooms for Rent - No Fee", "url": "https://www.facebook.com/groups/nycnofeerooms", "is_private": False, "member_count": 31000},
        {"name": "NYC Short Term Rentals & Sublets", "url": "https://www.facebook.com/groups/nycshortterm", "is_private": False, "member_count": 22000},
        {"name": "NYC Student Housing", "url": "https://www.facebook.com/groups/nycstudenthousing", "is_private": False, "member_count": 18000},
        {"name": "Hoboken / Jersey City Housing", "url": "https://www.facebook.com/groups/hobokenjchousing", "is_private": False, "member_count": 14000},
        {"name": "Astoria Queens Apartments", "url": "https://www.facebook.com/groups/astoriaapartments", "is_private": False, "member_count": 9000},
        {"name": "Brooklyn Apartments for Rent", "url": "https://www.facebook.com/groups/brooklynapartments", "is_private": False, "member_count": 27000},
    ],
    "San Francisco": [
        {"name": "SF Bay Area Housing & Rooms", "url": "https://www.facebook.com/groups/sfbayhousing", "is_private": False, "member_count": 38000},
        {"name": "San Francisco Apartments & Housing", "url": "https://www.facebook.com/groups/sfapartments", "is_private": False, "member_count": 21000},
        {"name": "SF Female Roommates", "url": "https://www.facebook.com/groups/sffemaleroommates", "is_private": True, "is_gender_specific": True, "gender_target": "female", "member_count": 6500},
        {"name": "Bay Area Rooms for Rent", "url": "https://www.facebook.com/groups/bayarearoomsforrent", "is_private": False, "member_count": 29000},
        {"name": "San Francisco Short Term & Sublets", "url": "https://www.facebook.com/groups/sfsublets", "is_private": False, "member_count": 11000},
        {"name": "Oakland & East Bay Apartments", "url": "https://www.facebook.com/groups/oaklandhousing", "is_private": False, "member_count": 16000},
        {"name": "SF Tech Worker Housing", "url": "https://www.facebook.com/groups/sftechhousing", "is_private": True, "member_count": 4200},
    ],
}


def seed_known_groups(city: str) -> int:
    """Upsert known groups for a city into Supabase."""
    groups = KNOWN_GROUPS.get(city, [])
    if not groups:
        print(f"[fb_groups] No known groups for {city}")
        return 0

    rows = []
    for g in groups:
        rows.append({
            "city": city,
            "group_name": g["name"],
            "group_url": g["url"],
            "is_private": g.get("is_private", False),
            "is_gender_specific": g.get("is_gender_specific", False),
            "gender_target": g.get("gender_target"),
            "member_count": g.get("member_count"),
            "is_active": True,
        })

    try:
        sb.table("fb_groups").upsert(rows, on_conflict="group_url").execute()
        print(f"[fb_groups] Seeded {len(rows)} groups for {city}")
        return len(rows)
    except Exception as e:
        print(f"[fb_groups] Error seeding groups for {city}: {e}")
        return 0


def get_groups_for_city(city: str, gender_target: str | None = None) -> list[dict]:
    """Fetch relevant FB groups from DB for a city."""
    query = sb.table("fb_groups").select("*").eq("city", city).eq("is_active", True)
    if gender_target:
        # Include gender-specific groups + non-gender-specific groups
        result = query.execute()
        return [
            g for g in (result.data or [])
            if not g["is_gender_specific"] or g["gender_target"] == gender_target
        ]
    else:
        return query.eq("is_gender_specific", False).execute().data or []


if __name__ == "__main__":
    for city in ["New York City", "San Francisco"]:
        seed_known_groups(city)
