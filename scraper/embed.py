"""Embed listings using ZeroEntropy zembed-1 and store vectors in Supabase."""
import os
from zeroentropy import ZeroEntropy
from supabase import create_client
from normalize import Listing

ze_client = ZeroEntropy(api_key=os.environ["ZEROENTROPY_API_KEY"])
sb_client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


def embed_and_store(listing_id: str, listing: Listing) -> bool:
    """Embed a single listing and upsert the vector into Supabase."""
    text = listing.to_embed_text()
    try:
        response = ze_client.models.embed(
            model="zembed-1",
            input=text,
        )
        vector = response.data[0].embedding

        sb_client.table("listing_vectors").upsert({
            "listing_id": listing_id,
            "embedding": vector,
        }).execute()
        return True
    except Exception as e:
        print(f"[embed] Failed to embed listing {listing_id}: {e}")
        return False


def embed_batch(listing_ids_and_listings: list[tuple[str, Listing]]) -> int:
    """Embed a batch of listings. Returns count of successes."""
    success = 0
    for listing_id, listing in listing_ids_and_listings:
        if embed_and_store(listing_id, listing):
            success += 1
    return success
