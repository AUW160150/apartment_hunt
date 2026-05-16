import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { onboardingReply, extractPreferences } from '@/lib/claude'
import { writePreferences } from '@/lib/gbrain'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { messages } = await req.json()
  if (!Array.isArray(messages)) {
    return NextResponse.json({ error: 'messages required' }, { status: 400 })
  }

  // Extract what we've collected so far
  const prefs = await extractPreferences(messages)
  const collectedFields = Object.keys(prefs).filter(k => prefs[k as keyof typeof prefs] !== undefined)

  const allRequired = ['city', 'budget_max', 'commute_origin', 'stay_duration', 'deal_breakers']
  const isComplete = allRequired.every(f => collectedFields.includes(f))

  let reply: string
  if (isComplete) {
    // Save preferences to Supabase + Gbrain
    await supabase.from('user_preferences').upsert({
      user_id: user.id,
      city: prefs.city!,
      budget_min: prefs.budget_min ?? 0,
      budget_max: prefs.budget_max!,
      bedrooms_min: prefs.bedrooms_min ?? 1,
      commute_origin: prefs.commute_origin,
      commute_max_minutes: prefs.commute_max_minutes ?? 45,
      deal_breakers: prefs.deal_breakers ?? [],
      nice_to_haves: prefs.nice_to_haves ?? [],
      stay_duration: prefs.stay_duration ?? 'permanent',
      open_to_shared: prefs.open_to_shared ?? false,
      max_roommates: prefs.max_roommates ?? 0,
      needs_gender_groups: prefs.needs_gender_groups ?? false,
    }, { onConflict: 'user_id' })

    await writePreferences(user.id, prefs)

    reply = `All set! I'm searching for apartments in ${prefs.city} now. Your dashboard will update as I find matches. I'll contact landlords automatically when I find something that fits — you'll see everything in the pipeline.`
  } else {
    reply = await onboardingReply(messages, collectedFields)
  }

  return NextResponse.json({ reply, complete: isComplete, preferences: prefs })
}
