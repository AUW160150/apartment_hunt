'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export default function LoginPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-2">
          <div className="text-4xl mb-2">🏠</div>
          <CardTitle className="text-2xl font-bold">ApartmentAgent</CardTitle>
          <CardDescription>
            Your AI apartment hunter. Set your preferences once, let the agent handle the rest.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="text-center space-y-3">
              <div className="text-3xl">📬</div>
              <p className="font-medium">Check your email</p>
              <p className="text-sm text-muted-foreground">
                We sent a magic link to <strong>{email}</strong>. Click it to sign in — no password needed.
              </p>
              <Button variant="ghost" className="text-xs" onClick={() => setSent(false)}>
                Use a different email
              </Button>
            </div>
          ) : (
            <form onSubmit={sendMagicLink} className="space-y-3">
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
              />
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? 'Sending…' : 'Send Magic Link'}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                By continuing, you agree to let ApartmentAgent search and contact landlords on your behalf.
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
