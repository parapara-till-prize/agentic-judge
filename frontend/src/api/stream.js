// SSE over POST. EventSource is GET-only and can't send a body, so we POST with fetch()
// and read the streamed `data: {json}\n\n` frames off the response body ourselves.
import { BASE_URL } from './client'

export async function streamMessage(attemptId, text, { onEvent, signal } = {}) {
  const res = await fetch(`${BASE_URL}/attempts/${attemptId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ text }),
    credentials: 'include',
    signal,
  })
  if (!res.ok || !res.body) {
    let detail
    try {
      detail = (await res.json()).detail
    } catch {
      /* non-JSON */
    }
    throw new Error(detail || `${res.status} ${res.statusText}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  // SSE frames are separated by a blank line; each `data:` line holds one JSON event.
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let sep
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      const line = frame.split('\n').find((l) => l.startsWith('data:'))
      if (!line) continue
      try {
        onEvent?.(JSON.parse(line.slice(5).trim()))
      } catch {
        /* ignore malformed frame */
      }
    }
  }
}
