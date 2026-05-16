'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface Listing {
  id: string
  source: string
  title?: string
  price?: number
  rooms?: number
  price_per_room?: number
  address?: string
  sqft?: number
  has_photos: boolean
  photo_urls: string[]
  amenities: string[]
  url?: string
  contact_email?: string
  is_flagged_scam: boolean
  scam_flags: string[]
}

interface ListingMatch {
  id: string
  relevance_score: number
  commute_minutes?: number
  status: string
  listings: Listing
}

interface ListingCardProps {
  match: ListingMatch
  sharedNote?: string
  onReject: (listingId: string, reason: string) => void
  onContact: (listingId: string) => void
  onFavorite: (listingId: string) => void
}

const SOURCE_LABELS: Record<string, string> = {
  zillow: 'Zillow',
  apartments_com: 'Apartments.com',
  fb: 'Facebook',
  hog: 'Social',
  craigslist: 'Craigslist',
}

export default function ListingCard({ match, sharedNote, onReject, onContact, onFavorite }: ListingCardProps) {
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [contacted, setContacted] = useState(match.status === 'contacted')
  const listing = match.listings

  const scorePercent = Math.round((match.relevance_score ?? 0) * 100)

  function handleContact() {
    setContacted(true)
    onContact(listing.id)
  }

  function handleRejectSubmit() {
    if (!rejectReason.trim()) return
    onReject(listing.id, rejectReason)
    setRejecting(false)
  }

  return (
    <Card className={`overflow-hidden ${listing.is_flagged_scam ? 'border-red-200 bg-red-50' : ''}`}>
      {/* Photo strip */}
      {listing.photo_urls.length > 0 ? (
        <div className="h-40 overflow-hidden">
          <img
            src={listing.photo_urls[0]}
            alt={listing.title ?? 'Listing'}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="h-28 bg-muted flex items-center justify-center">
          <span className="text-muted-foreground text-sm">No photos</span>
        </div>
      )}

      <CardContent className="p-4 space-y-3">
        {/* Source + score */}
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="text-xs">
            {SOURCE_LABELS[listing.source] ?? listing.source}
          </Badge>
          <span className="text-xs text-muted-foreground">{scorePercent}% match</span>
        </div>

        {/* Scam warning */}
        {listing.is_flagged_scam && (
          <div className="text-xs text-red-600 font-medium">
            ⚠ Flagged: {listing.scam_flags.join(', ')}
          </div>
        )}

        {/* Price + rooms */}
        <div>
          <div className="text-xl font-bold">
            {listing.price ? `$${listing.price.toLocaleString()}/mo` : 'Price TBD'}
          </div>
          <div className="text-sm text-muted-foreground">
            {listing.rooms ? `${listing.rooms} bed` : ''}
            {listing.sqft ? ` · ${listing.sqft.toLocaleString()} sqft` : ''}
            {listing.price_per_room && (listing.rooms ?? 1) > 1
              ? ` · $${listing.price_per_room}/room`
              : ''}
          </div>
        </div>

        {/* Shared room note */}
        {sharedNote && (
          <div className="text-xs bg-blue-50 border border-blue-200 rounded px-2 py-1.5 text-blue-800">
            {sharedNote}
          </div>
        )}

        {/* Address + commute */}
        {listing.address && (
          <div className="text-sm">
            <span>{listing.address}</span>
            {match.commute_minutes && (
              <span className="text-muted-foreground ml-1">· {match.commute_minutes} min transit</span>
            )}
          </div>
        )}

        {/* Amenities */}
        {listing.amenities.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {listing.amenities.slice(0, 4).map(a => (
              <Badge key={a} variant="outline" className="text-xs">{a}</Badge>
            ))}
          </div>
        )}

        {/* Actions */}
        {rejecting ? (
          <div className="space-y-2">
            <Textarea
              placeholder="Why are you passing? (e.g. too far, no laundry, too expensive)"
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              className="text-sm h-20"
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={handleRejectSubmit}>
                Confirm Pass
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              className="flex-1"
              onClick={handleContact}
              disabled={contacted}
            >
              {contacted ? 'Contacted ✓' : 'Contact Agent'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => onFavorite(listing.id)}>
              ♡
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRejecting(true)}>
              Pass
            </Button>
            {listing.url && (
              <a href={listing.url} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="ghost">↗</Button>
              </a>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
