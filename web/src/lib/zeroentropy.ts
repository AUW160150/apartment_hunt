import ZeroEntropy from 'zeroentropy'

const client = new ZeroEntropy({ apiKey: process.env.ZEROENTROPY_API_KEY })

// Build a query string from user preferences for reranking
export function preferencesToQuery(prefs: {
  city: string
  budget_max: number
  bedrooms_min: number
  commute_origin?: string
  deal_breakers: string[]
  nice_to_haves: string[]
  stay_duration: string
  open_to_shared: boolean
}): string {
  const parts = [
    `apartment in ${prefs.city}`,
    `under $${prefs.budget_max}/month`,
    `${prefs.bedrooms_min}+ bedroom`,
  ]
  if (prefs.commute_origin) parts.push(`near ${prefs.commute_origin}`)
  if (prefs.nice_to_haves.length) parts.push(prefs.nice_to_haves.join(', '))
  if (prefs.open_to_shared) parts.push('shared housing ok')
  if (prefs.deal_breakers.length) parts.push(`must have: ${prefs.deal_breakers.join(', ')}`)
  if (prefs.stay_duration !== 'permanent') parts.push(`${prefs.stay_duration} stay, furnished preferred`)
  return parts.join('. ')
}

// Serialize a listing to text for embedding/reranking
export function listingToText(listing: {
  title?: string
  address?: string
  price?: number
  rooms?: number
  sqft?: number
  amenities?: string[]
  has_photos?: boolean
  source?: string
}): string {
  const parts = [
    listing.title ?? 'Apartment listing',
    listing.address ? `at ${listing.address}` : '',
    listing.price ? `$${listing.price}/month` : '',
    listing.rooms ? `${listing.rooms} bedroom` : '',
    listing.sqft ? `${listing.sqft} sqft` : '',
    listing.amenities?.length ? `amenities: ${listing.amenities.join(', ')}` : '',
    listing.has_photos ? 'has photos' : 'no photos',
    listing.source ? `source: ${listing.source}` : '',
  ]
  return parts.filter(Boolean).join('. ')
}

export interface RankedListing {
  id: string
  relevance_score: number
}

// Rerank a set of listings against user preferences using zerank-2
export async function rerankListings(
  query: string,
  listings: Array<{ id: string; text: string }>,
  topK = 20
): Promise<RankedListing[]> {
  if (!listings.length) return []

  const response = await client.models.rerank({
    model: 'zerank-2',
    query,
    documents: listings.map(l => l.text),
    top_n: Math.min(topK, listings.length),
  })

  return response.results.map(result => ({
    id: listings[result.index].id,
    relevance_score: result.relevance_score,
  }))
}
