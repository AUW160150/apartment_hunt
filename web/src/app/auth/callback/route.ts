import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Check if user has completed onboarding
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: prefs } = await supabase
          .from('user_preferences')
          .select('id')
          .eq('user_id', user.id)
          .single()

        return NextResponse.redirect(
          new URL(prefs ? next : '/onboarding', origin)
        )
      }
    }
  }

  return NextResponse.redirect(new URL('/login?error=auth_failed', origin))
}
