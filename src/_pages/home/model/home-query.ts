export type HomeQuery = {
  ride: number | null
}

export const emptyHomeQuery: HomeQuery = { ride: null }

export function parseHomeQuery(search: string | URLSearchParams): HomeQuery {
  const params =
    typeof search === 'string'
      ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
      : search

  return { ride: parseRide(params.get('ride')) }
}

export function parseHomeHash(hash: string): HomeQuery {
  const raw = hash.replace(/^#/, '')
  if (!raw) return emptyHomeQuery
  if (/^\d+$/.test(raw)) return { ride: parseRide(raw) }
  return parseHomeQuery(raw)
}

export function readHomeQuery(search: string, hash = ''): HomeQuery {
  const fromSearch = parseHomeQuery(search)
  const fromHash = parseHomeHash(hash)
  return { ride: fromSearch.ride ?? fromHash.ride }
}

export function writeHomeQuery(params: URLSearchParams, query: HomeQuery) {
  if (query.ride == null) params.delete('ride')
  else params.set('ride', String(query.ride))
}

export function isHomeHash(hash: string) {
  return parseHomeHash(hash).ride != null
}

function parseRide(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return null
  const ride = Number(value)
  return ride > 0 ? ride : null
}
