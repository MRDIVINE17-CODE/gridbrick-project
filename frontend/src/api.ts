import { useEffect, useState } from 'react'

// The data behind every endpoint is a fixed snapshot, so responses are cached
// for the lifetime of the page: flicking between days or tabs is instant.
const cache = new Map<string, Promise<unknown>>()

export function fetchJson<T>(path: string): Promise<T> {
  let request = cache.get(path)
  if (!request) {
    request = fetch(path).then(async (response) => {
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(typeof body.detail === 'string' ? body.detail : `Request failed (${response.status})`)
      }
      return response.json()
    })
    request.catch(() => cache.delete(path))
    cache.set(path, request)
  }
  return request as Promise<T>
}

export type Loadable<T> =
  | { state: 'loading'; data?: T }
  | { state: 'ready'; data: T }
  | { state: 'error'; error: string; data?: T }

type Settled<T> = { path: string; data?: T; error?: string }

/** Fetch `path`; while the next path loads, keep returning the previous data. */
export function useApi<T>(path: string | null): Loadable<T> {
  const [settled, setSettled] = useState<Settled<T> | null>(null)

  useEffect(() => {
    if (!path) return
    let live = true
    fetchJson<T>(path).then(
      (data) => live && setSettled({ path, data }),
      (error: Error) => live && setSettled((prev) => ({ path, data: prev?.data, error: error.message })),
    )
    return () => {
      live = false
    }
  }, [path])

  if (!settled || settled.path !== path) return { state: 'loading', data: settled?.data }
  if (settled.error !== undefined) return { state: 'error', error: settled.error, data: settled.data }
  return { state: 'ready', data: settled.data as T }
}
