export function normalizeToken(value: string): string {
  return value.trim().toLowerCase()
}

export function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

export function splitCsvOrRepeated(values: string | string[] | undefined | null): string[] {
  const list = Array.isArray(values) ? values : values ? [values] : []
  return uniq(
    list
      .flatMap((entry) => String(entry).split(','))
      .map((entry) => normalizeToken(entry))
      .filter((entry) => entry.length > 0),
  )
}

export function tokenizeQuery(value: string | undefined | null): string[] {
  if (!value) {
    return []
  }

  return uniq(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/u)
      .map((token) => token.trim())
      .filter((token) => token.length > 1),
  )
}

export function truthyParam(value: string | null | undefined): boolean | null {
  if (value == null || value === '') {
    return null
  }

  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes'].includes(normalized)) {
    return true
  }
  if (['0', 'false', 'no'].includes(normalized)) {
    return false
  }
  return null
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort())
}

export function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json; charset=utf-8')
  }
  return new Response(`${JSON.stringify(data, null, 2)}\n`, {
    ...init,
    headers,
  })
}

export function textResponse(text: string, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  if (!headers.has('content-type')) {
    headers.set('content-type', 'text/plain; charset=utf-8')
  }
  return new Response(text, { ...init, headers })
}

export function compareStrings(a: string, b: string): number {
  return a.localeCompare(b)
}

export function parseLimit(raw: string | null, fallback: number, max: number): number {
  const parsed = raw ? Number.parseInt(raw, 10) : fallback
  const normalized = Number.isFinite(parsed) ? parsed : fallback
  return clamp(normalized, 1, max)
}
