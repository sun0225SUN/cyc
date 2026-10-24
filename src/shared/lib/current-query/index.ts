export function currentSearchQuery() {
  if (typeof window === 'undefined') return undefined
  const query = Object.fromEntries(new URLSearchParams(window.location.search))
  return Object.keys(query).length > 0 ? query : undefined
}

export function hrefWithCurrentQuery(pathname: string) {
  const query = currentSearchQuery()
  return query ? { pathname, query } : pathname
}
