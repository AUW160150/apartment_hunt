import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rerankListings, preferencesToQuery, listingToText } from '@/lib/zeroentropy'
import { batchCommuteTimes } from '@/lib/maps'
import { evaluateSharedRoom } from '@/lib/claude'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? 'new'

  // Load user preferences
  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!prefs) return NextResponse.json({ listings: [], message: 'Complete onboarding first' })

  // Fetch existing matches for this status
  const { data: matches } = await supabase
    .from('listing_matches')
    .select(`
      id, relevance_score, commute_minutes, status, matched_at, follow_up_count,
      listings (
        id, source, title, price, rooms, price_per_room, address, lat, lng,
        sqft, has_photos, photo_urls, amenities, url, contact_email,
        is_flagged_scam, scam_flags
      )
    `)
    .eq('user_id', user.id)
    .eq('status', status)
    .order('relevance_score', { ascending: false })
    .limit(50)

  if (matches && matches.length > 0) {
    return NextResponse.json({ listings: matches, preferences: prefs })
  }

  // No matches yet — run initial ranking from raw listings
  const { data: rawListings } = await supabase
    .from('listings')
    .select('id, source, title, price, rooms, sqft, amenities, has_photos, address')
    .eq('is_flagged_scam', false)
    .lte('price', prefs.budget_max)
    .gte('rooms', prefs.bedrooms_min)
    .limit(200)

  if (!rawListings?.length) {
    return NextResponse.json({ listings: [], message: 'Scraper is seeding data, check back soon' })
  }

  // Build query and rerank
  const query = preferencesToQuery(prefs)
  const docs = rawListings.map(l => ({ id: l.id, text: listingToText(l) }))
  const ranked = await rerankListings(query, docs, 30)

  // Batch commute times for top results that have addresses
  const topListings = ranked.slice(0, 30).map(r => rawListings.find(l => l.id === r.id)!).filter(Boolean)
  const addresses = topListings.map(l => l.address).filter(Boolean) as string[]
  const commuteMap = prefs.commute_origin
    ? await batchCommuteTimes(prefs.commute_origin, addresses)
    : new Map()

  // Upsert matches into DB and evaluate shared rooms
  const matchRows = await Promise.all(
    ranked.slice(0, 30).map(async (r) => {
      const listing = rawListings.find(l => l.id === r.id)
      const commute = listing?.address ? commuteMap.get(listing.address) : null

      let sharedNote: string | undefined
      if (listing && prefs.open_to_shared && (listing.rooms ?? 1) > 1) {
        const eval_ = await evaluateSharedRoom({
          listingTitle: listing.title ?? '',
          totalRooms: listing.rooms ?? 1,
          totalPrice: listing.price ?? 0,
          userBudget: prefs.budget_max,
          stayDuration: prefs.stay_duration,
          userOpenToShared: prefs.open_to_shared,
          maxRoommates: prefs.max_roommates,
        })
        if (eval_.viable) sharedNote = eval_.note
      }

      return {
        user_id: user.id,
        listing_id: r.id,
        relevance_score: r.relevance_score,
        commute_minutes: commute?.minutes ?? null,
        status: 'new',
        _shared_note: sharedNote,
      }
    })
  )

  await supabase.from('listing_matches').upsert(
    matchRows.map(({ _shared_note: _, ...row }) => row),
    { onConflict: 'user_id,listing_id' }
  )

  // Re-fetch with full listing data
  const { data: freshMatches } = await supabase
    .from('listing_matches')
    .select(`
      id, relevance_score, commute_minutes, status, matched_at,
      listings (
        id, source, title, price, rooms, price_per_room, address, lat, lng,
        sqft, has_photos, photo_urls, amenities, url, contact_email,
        is_flagged_scam, scam_flags
      )
    `)
    .eq('user_id', user.id)
    .eq('status', 'new')
    .order('relevance_score', { ascending: false })
    .limit(30)

  return NextResponse.json({
    listings: freshMatches ?? [],
    preferences: prefs,
    sharedNotes: Object.fromEntries(
      matchRows.filter(r => r._shared_note).map(r => [r.listing_id, r._shared_note])
    ),
  })
}
