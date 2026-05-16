'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import ListingCard from '@/components/ListingCard'
import GroupDiscovery from '@/components/GroupDiscovery'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'

const STATUSES = [
  { key: 'new', label: 'New', emoji: '🔍' },
  { key: 'contacted', label: 'Contacted', emoji: '📬' },
  { key: 'responded', label: 'Responded', emoji: '💬' },
  { key: 'touring', label: 'Touring', emoji: '🗝️' },
  { key: 'passed', label: 'Passed', emoji: '✕' },
]

export default function DashboardPage() {
  const [activeStatus, setActiveStatus] = useState('new')
  const [matches, setMatches] = useState<any[]>([])
  const [sharedNotes, setSharedNotes] = useState<Record<string, string>>({})
  const [fbGroups, setFbGroups] = useState<any[]>([])
  const [preferences, setPreferences] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    fetchListings(activeStatus)
  }, [activeStatus])

  useEffect(() => {
    fetchGroups()
  }, [])

  async function fetchListings(status: string) {
    setLoading(true)
    const res = await fetch(`/api/listings?status=${status}`)
    const data = await res.json()
    setMatches(data.listings ?? [])
    setSharedNotes(data.sharedNotes ?? {})
    setPreferences(data.preferences)
    setLoading(false)
  }

  async function fetchGroups() {
    if (!preferences?.city) return
    const { data } = await supabase
      .from('fb_groups')
      .select('*')
      .eq('city', preferences.city)
      .eq('is_active', true)
    setFbGroups(data ?? [])
  }

  useEffect(() => {
    if (preferences?.city) fetchGroups()
  }, [preferences])

  async function handleContact(listingId: string) {
    await fetch('/api/outreach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingId }),
    })
  }

  async function handleReject(listingId: string, reason: string) {
    const match = matches.find(m => m.listings.id === listingId)
    await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'rejection',
        listingId,
        listingAddress: match?.listings?.address ?? '',
        reason,
      }),
    })
    setMatches(prev => prev.filter(m => m.listings.id !== listingId))
  }

  async function handleFavorite(listingId: string) {
    await supabase.from('user_feedback').insert({
      listing_id: listingId,
      action: 'favorited',
    })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏠</span>
          <div>
            <h1 className="font-semibold">ApartmentAgent</h1>
            {preferences && (
              <p className="text-sm text-muted-foreground">
                {preferences.city} · up to ${preferences.budget_max?.toLocaleString()}/mo
              </p>
            )}
          </div>
        </div>
        <Badge variant="outline" className="text-xs">
          {matches.length} {activeStatus === 'new' ? 'matches' : activeStatus}
        </Badge>
      </div>

      {/* Status tabs */}
      <div className="bg-white border-b px-6 flex gap-1 overflow-x-auto">
        {STATUSES.map(s => (
          <button
            key={s.key}
            onClick={() => setActiveStatus(s.key)}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeStatus === s.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {s.emoji} {s.label}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-6">
        {/* Listings grid */}
        <div className="flex-1">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-72 bg-white rounded-lg border animate-pulse" />
              ))}
            </div>
          ) : matches.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <div className="text-4xl mb-3">
                {activeStatus === 'new' ? '🔍' : '📭'}
              </div>
              <p>
                {activeStatus === 'new'
                  ? 'Agent is searching… check back soon.'
                  : `No ${activeStatus} listings yet.`}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {matches.map(match => (
                <ListingCard
                  key={match.id}
                  match={match}
                  sharedNote={sharedNotes[match.listings?.id]}
                  onContact={handleContact}
                  onReject={handleReject}
                  onFavorite={handleFavorite}
                />
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-72 shrink-0 hidden lg:block">
          <GroupDiscovery
            groups={fbGroups}
            city={preferences?.city ?? 'your city'}
          />
        </div>
      </div>
    </div>
  )
}
