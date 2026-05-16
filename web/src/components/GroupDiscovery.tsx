'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

interface FbGroup {
  id: string
  group_name: string
  group_url: string
  is_private: boolean
  is_gender_specific: boolean
  gender_target?: string
  member_count?: number
}

interface GroupDiscoveryProps {
  groups: FbGroup[]
  city: string
}

export default function GroupDiscovery({ groups, city }: GroupDiscoveryProps) {
  const publicGroups = groups.filter(g => !g.is_private)
  const privateGroups = groups.filter(g => g.is_private)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          Facebook Housing Groups
          <Badge variant="secondary">{city}</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Agent monitors public groups automatically. Join private groups to unlock more listings.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {publicGroups.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Public — auto-monitored
            </p>
            <div className="space-y-2">
              {publicGroups.map(g => (
                <GroupRow key={g.id} group={g} actionLabel="Monitoring" actionDisabled />
              ))}
            </div>
          </div>
        )}

        {privateGroups.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Private — join to unlock
              </p>
              <div className="space-y-2">
                {privateGroups.map(g => (
                  <GroupRow key={g.id} group={g} actionLabel="Join Group" />
                ))}
              </div>
            </div>
          </>
        )}

        {groups.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No groups found for {city} yet.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function GroupRow({ group, actionLabel, actionDisabled }: {
  group: FbGroup
  actionLabel: string
  actionDisabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{group.group_name}</div>
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          {group.member_count ? `${(group.member_count / 1000).toFixed(0)}k members` : ''}
          {group.is_gender_specific && group.gender_target && (
            <Badge variant="outline" className="text-xs py-0">
              {group.gender_target}-only
            </Badge>
          )}
        </div>
      </div>
      {actionDisabled ? (
        <Badge variant="secondary" className="text-xs shrink-0">{actionLabel}</Badge>
      ) : (
        <a href={group.group_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
          <Button size="sm" variant="outline" className="text-xs h-7">
            {actionLabel} ↗
          </Button>
        </a>
      )}
    </div>
  )
}
