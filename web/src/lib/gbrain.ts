import { execSync } from 'child_process'

// Gbrain is accessed via the CLI (gbrain serve runs as MCP, but for server-side
// Next.js API routes we call the CLI directly for simplicity in v1)

function gbrainExec(args: string): string {
  try {
    return execSync(`gbrain ${args}`, {
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, PATH: `${process.env.HOME}/.bun/bin:${process.env.PATH}` },
    }).trim()
  } catch {
    return ''
  }
}

function sanitizeSlug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 80)
}

// Write user preferences to Gbrain memory
export async function writePreferences(userId: string, prefs: Record<string, unknown>): Promise<void> {
  const slug = `user-prefs-${userId}`
  const content = `# User Preferences (${userId})

${JSON.stringify(prefs, null, 2)}

Updated: ${new Date().toISOString()}
`
  gbrainExec(`put_page --title "${slug}" --tags "user-preferences,user-${userId}" <<'EOF'\n${content}\nEOF`)
}

// Read user preferences from Gbrain
export async function readPreferences(userId: string): Promise<Record<string, unknown> | null> {
  const result = gbrainExec(`get_page "user-prefs-${userId}"`)
  if (!result) return null
  const jsonMatch = result.match(/```json\n([\s\S]*?)\n```/) || result.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  try {
    return JSON.parse(jsonMatch[1] ?? jsonMatch[0])
  } catch {
    return null
  }
}

// Write a rejection reason to Gbrain memory
export async function writeRejection(params: {
  userId: string
  listingId: string
  listingAddress: string
  reason: string
}): Promise<void> {
  const slug = `rejection-${params.userId}-${sanitizeSlug(params.listingId)}`
  const content = `# Rejected Listing

User: ${params.userId}
Listing: ${params.listingAddress} (${params.listingId})
Reason: ${params.reason}
Timestamp: ${new Date().toISOString()}
`
  gbrainExec(`put_page --title "${slug}" --tags "rejection,user-${params.userId}" <<'EOF'\n${content}\nEOF`)
}

// Write geographic override (user said no to an area we suggested)
export async function writeGeoOverride(params: {
  userId: string
  area: string
  reason: string
}): Promise<void> {
  const slug = `geo-override-${params.userId}-${sanitizeSlug(params.area)}`
  const content = `# Geographic Override

User: ${params.userId}
Excluded area: ${params.area}
Reason: ${params.reason}
Timestamp: ${new Date().toISOString()}

Do NOT suggest this area again unless user explicitly asks.
`
  gbrainExec(`put_page --title "${slug}" --tags "geo-override,user-${params.userId}" <<'EOF'\n${content}\nEOF`)
}

// Search Gbrain for context about a user (preferences, rejections, overrides)
export async function searchUserContext(userId: string, query?: string): Promise<string> {
  const searchQuery = query ?? `user ${userId} preferences rejections`
  return gbrainExec(`search "${searchQuery}"`)
}

// Write landlord interaction to memory
export async function writeLandlordInteraction(params: {
  userId: string
  listingId: string
  landlordName?: string
  summary: string
}): Promise<void> {
  const slug = `landlord-${params.userId}-${sanitizeSlug(params.listingId)}`
  const content = `# Landlord Interaction

User: ${params.userId}
Listing: ${params.listingId}
Landlord: ${params.landlordName ?? 'unknown'}
Summary: ${params.summary}
Timestamp: ${new Date().toISOString()}
`
  gbrainExec(`put_page --title "${slug}" --tags "landlord,user-${params.userId}" <<'EOF'\n${content}\nEOF`)
}
