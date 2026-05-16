export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import OnboardingChat from '@/components/OnboardingChat'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Skip onboarding if already completed
  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (prefs) redirect('/dashboard')

  return <OnboardingChat />
}
