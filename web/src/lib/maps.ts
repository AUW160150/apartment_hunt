const MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY

export interface CommuteResult {
  minutes: number
  description: string  // e.g. "28 min via subway"
  mode: string
}

// Get transit commute time between two addresses using Google Maps Distance Matrix
export async function getCommuteTime(
  origin: string,
  destination: string
): Promise<CommuteResult | null> {
  if (!MAPS_API_KEY || !origin || !destination) return null

  const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json')
  url.searchParams.set('origins', origin)
  url.searchParams.set('destinations', destination)
  url.searchParams.set('mode', 'transit')
  url.searchParams.set('units', 'imperial')
  url.searchParams.set('key', MAPS_API_KEY)

  const res = await fetch(url.toString())
  const data = await res.json()

  const element = data.rows?.[0]?.elements?.[0]
  if (!element || element.status !== 'OK') return null

  const minutes = Math.round(element.duration.value / 60)
  return {
    minutes,
    description: `${minutes} min by transit`,
    mode: 'transit',
  }
}

// Batch commute times for multiple destinations from a single origin
export async function batchCommuteTimes(
  origin: string,
  destinations: string[]
): Promise<Map<string, CommuteResult | null>> {
  const results = new Map<string, CommuteResult | null>()
  if (!MAPS_API_KEY || !origin || !destinations.length) return results

  // Google Maps allows up to 25 destinations per request
  const chunks = []
  for (let i = 0; i < destinations.length; i += 25) {
    chunks.push(destinations.slice(i, i + 25))
  }

  for (const chunk of chunks) {
    const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json')
    url.searchParams.set('origins', origin)
    url.searchParams.set('destinations', chunk.join('|'))
    url.searchParams.set('mode', 'transit')
    url.searchParams.set('units', 'imperial')
    url.searchParams.set('key', MAPS_API_KEY)

    const res = await fetch(url.toString())
    const data = await res.json()

    chunk.forEach((dest, i) => {
      const element = data.rows?.[0]?.elements?.[i]
      if (element?.status === 'OK') {
        results.set(dest, {
          minutes: Math.round(element.duration.value / 60),
          description: `${Math.round(element.duration.value / 60)} min by transit`,
          mode: 'transit',
        })
      } else {
        results.set(dest, null)
      }
    })
  }

  return results
}
