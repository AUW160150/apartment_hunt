const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'meta-llama/llama-3.3-70b-instruct:free'

async function chat(
  system: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens = 1024
): Promise<string> {
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
  })
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

export interface UserPreferences {
  city: string
  budget_min: number
  budget_max: number
  bedrooms_min: number
  commute_origin?: string
  commute_max_minutes: number
  deal_breakers: string[]
  nice_to_haves: string[]
  stay_duration: 'permanent' | 'internship' | 'short-term'
  open_to_shared: boolean
  max_roommates: number
  needs_gender_groups: boolean
}

// Extract structured preferences from onboarding conversation
export async function extractPreferences(
  conversation: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<Partial<UserPreferences>> {
  const text = await chat(
    `You extract apartment search preferences from a conversation.
Return a JSON object with these fields (omit any not mentioned):
- city: string (full city name)
- budget_min: number (monthly USD, 0 if not specified)
- budget_max: number (monthly USD, required)
- bedrooms_min: number (default 1)
- commute_origin: string (full address or neighborhood)
- commute_max_minutes: number (default 45)
- deal_breakers: string[] (hard requirements, e.g. ["pets allowed", "in-unit laundry"])
- nice_to_haves: string[] (preferences, e.g. ["dishwasher", "doorman"])
- stay_duration: "permanent" | "internship" | "short-term"
- open_to_shared: boolean
- max_roommates: number
- needs_gender_groups: boolean (true if user wants female-only or gender-specific housing)

Return ONLY valid JSON, no explanation.`,
    conversation,
    1024
  )
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  return jsonMatch ? JSON.parse(jsonMatch[0]) : {}
}

// Generate onboarding assistant reply
export async function onboardingReply(
  conversation: Array<{ role: 'user' | 'assistant'; content: string }>,
  collectedFields: string[]
): Promise<string> {
  const missing = [
    'city', 'budget_max', 'commute_origin', 'stay_duration', 'deal_breakers',
  ].filter(f => !collectedFields.includes(f))

  return chat(
    `You are a friendly, efficient apartment search assistant. Your goal is to collect the user's apartment requirements in a natural conversation.

Still needed: ${missing.join(', ') || 'all collected — confirm and wrap up'}.

Rules:
- Ask ONE question at a time. Never more.
- Be conversational, not form-like.
- If the user mentions their workplace or school, note that for commute calculation.
- If the user mentions an internship or short-term stay, ask about furnished preference.
- If the user mentions wanting female-only housing, note it.
- When all fields are collected, summarize what you heard and confirm.
- Keep responses under 3 sentences.`,
    conversation,
    512
  )
}

// Geographic intelligence: should we suggest a nearby area the user excluded?
export async function geoIntelligenceSuggestion(params: {
  excludedArea: string
  reason?: string
  userPrefs: Partial<UserPreferences>
  commuteMinutes: number
  medianRent: number
}): Promise<{ suggest: boolean; rationale: string }> {
  const text = await chat(
    `You decide whether to surface a nearby area the user excluded.
Return JSON: { "suggest": boolean, "rationale": string }
Only suggest if: commute ≤ 30 min AND rent savings > 20% vs their target area.
Rationale must be one punchy sentence the agent can show the user.`,
    [{ role: 'user', content: JSON.stringify(params) }],
    256
  )
  const json = text.match(/\{[\s\S]*\}/)
  return json ? JSON.parse(json[0]) : { suggest: false, rationale: '' }
}

// Draft outreach email to a landlord
export async function draftOutreachEmail(params: {
  listingTitle: string
  listingAddress: string
  listingPrice: number
  contactName?: string
  userPrefs: Partial<UserPreferences>
  missingInfo: string[]  // e.g. ["in-unit laundry", "exact address", "photos"]
}): Promise<{ subject: string; body: string }> {
  const text = await chat(
    `You write professional, warm outreach emails to landlords on behalf of an apartment seeker.
Return JSON: { "subject": string, "body": string }
- Subject: short and specific (mention the listing)
- Body: 3-4 sentences max. Introduce the applicant briefly, express interest, ask about missing info naturally.
- If missingInfo includes "photos", politely ask for photos or a virtual tour link.
- Always ask for an in-person viewing option (this helps detect scams).
- Do not mention the agent or AI. Write as if from the user directly.
- Tone: professional but warm.`,
    [{ role: 'user', content: JSON.stringify(params) }],
    512
  )
  const json = text.match(/\{[\s\S]*\}/)
  return json ? JSON.parse(json[0]) : { subject: '', body: '' }
}

// Evaluate shared room opportunity
export async function evaluateSharedRoom(params: {
  listingTitle: string
  totalRooms: number
  totalPrice: number
  userBudget: number
  stayDuration: string
  userOpenToShared: boolean
  maxRoommates: number
}): Promise<{ viable: boolean; pricePerRoom: number; note: string }> {
  const pricePerRoom = Math.round(params.totalPrice / params.totalRooms)
  const roommates = params.totalRooms - 1

  if (!params.userOpenToShared || roommates > params.maxRoommates) {
    return { viable: false, pricePerRoom, note: '' }
  }

  const text = await chat(
    `Evaluate a shared housing opportunity. Return JSON: { "viable": boolean, "note": string }
note should be one sentence shown to the user, e.g. "Split 3 ways: $1,000/mo — fits your $1,200 budget."
If stay_duration is internship or short-term, add a note about furniture if relevant.`,
    [{ role: 'user', content: JSON.stringify({ ...params, pricePerRoom, roommates }) }],
    200
  )
  const json = text.match(/\{[\s\S]*\}/)
  const result = json ? JSON.parse(json[0]) : { viable: false, note: '' }
  return { ...result, pricePerRoom }
}

// Detect scam signals in a listing
export function detectScamFlags(listing: {
  has_photos: boolean
  address?: string
  price?: number
  raw_data?: Record<string, unknown>
}): string[] {
  const flags: string[] = []
  const rawText = JSON.stringify(listing.raw_data ?? '').toLowerCase()

  if (!listing.has_photos) flags.push('no_photos')
  if (!listing.address) flags.push('no_address')
  if (rawText.includes('wire transfer') || rawText.includes('western union')) flags.push('wire_transfer_request')
  if (rawText.includes('overseas') || rawText.includes('out of country') || rawText.includes('abroad')) flags.push('overseas_landlord')
  // Price >50% below $1500 (rough NYC/SF floor) is suspicious
  if (listing.price && listing.price < 750) flags.push('price_too_low')

  return flags
}
