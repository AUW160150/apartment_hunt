import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { draftOutreachEmail } from '@/lib/claude'
import { sendOutreachEmail } from '@/lib/resend'
import { writeLandlordInteraction } from '@/lib/gbrain'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { listingId } = await req.json()
  if (!listingId) return NextResponse.json({ error: 'listingId required' }, { status: 400 })

  // Load listing + user prefs
  const [{ data: listing }, { data: prefs }] = await Promise.all([
    supabase.from('listings').select('*').eq('id', listingId).single(),
    supabase.from('user_preferences').select('*').eq('user_id', user.id).single(),
  ])

  if (!listing) return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  if (!prefs) return NextResponse.json({ error: 'Complete onboarding first' }, { status: 400 })

  // Determine what info is missing from the listing
  const missingInfo: string[] = []
  if (!listing.has_photos || (listing.photo_urls as string[]).length === 0) missingInfo.push('photos')
  if (!listing.address) missingInfo.push('exact address')

  // Cross-check deal-breakers against amenities
  const amenities = (listing.amenities as string[]) ?? []
  const dealBreakersMissing = (prefs.deal_breakers as string[]).filter(
    db => !amenities.some((a: string) => a.toLowerCase().includes(db.toLowerCase()))
  )
  if (dealBreakersMissing.length) missingInfo.push(...dealBreakersMissing)

  // Draft email
  const { subject, body } = await draftOutreachEmail({
    listingTitle: listing.title ?? 'Apartment',
    listingAddress: listing.address ?? 'the address listed',
    listingPrice: listing.price ?? 0,
    contactName: listing.contact_name ?? undefined,
    userPrefs: prefs,
    missingInfo,
  })

  // Send if contact email exists
  let resendId: string | null = null
  let sendError: string | null = null
  let status = 'draft'

  if (listing.contact_email) {
    const result = await sendOutreachEmail({ to: listing.contact_email, subject, body })
    resendId = result.id
    sendError = result.error
    status = result.error ? 'draft' : 'sent'
  }

  // Record in DB
  const { data: message } = await supabase
    .from('outreach_messages')
    .insert({
      user_id: user.id,
      listing_id: listingId,
      message_text: body,
      channel: 'email',
      status,
      resend_message_id: resendId,
    })
    .select()
    .single()

  // Update match status to 'contacted'
  await supabase
    .from('listing_matches')
    .update({ status: 'contacted' })
    .eq('user_id', user.id)
    .eq('listing_id', listingId)

  // Write to Gbrain
  await writeLandlordInteraction({
    userId: user.id,
    listingId,
    landlordName: listing.contact_name ?? undefined,
    summary: `Sent outreach email. Subject: "${subject}". Missing info requested: ${missingInfo.join(', ') || 'none'}.`,
  })

  return NextResponse.json({
    message,
    subject,
    body,
    sent: status === 'sent',
    error: sendError,
    noEmail: !listing.contact_email,
  })
}
