import { create } from 'zustand'

// The live "attempt session" — the client-accumulated view of one run. Identity now comes
// from the session cookie via the /auth/me query, not this store. React Query owns the
// network calls (start/message/submit); this store owns the growing transcript, file
// snapshot and counters those calls produce.

// Map a backend tool name -> the chip kind/icon the Workspace renders.
const TOOL_KIND = {
  read_file: 'read',
  write_file: 'write',
  run_command: 'run',
  list_files: 'read',
}
const TOOL_ICON = { read: '⊟', write: '⊞', run: '▶' }

function toolChip(ev) {
  const kind = TOOL_KIND[ev.name] ?? 'read'
  return { kind, label: `${TOOL_ICON[kind]} ${ev.label}` }
}

// The backend emits a flat event list per turn: assistant text events interleaved with
// tool events. Fold them into chat messages, attaching tool chips to their agent bubble.
function eventsToMessages(events = []) {
  const out = []
  for (const ev of events) {
    if (ev.type === 'tool') {
      let last = out[out.length - 1]
      if (!last || last.role !== 'agent') {
        last = { role: 'agent', text: '', tools: [] }
        out.push(last)
      }
      last.tools = [...(last.tools ?? []), toolChip(ev)]
    } else if (ev.role === 'agent') {
      out.push({ role: 'agent', text: ev.text ?? '', tools: [] })
    }
  }
  return out
}

const EMPTY_SESSION = {
  attemptId: null,
  problemId: null,
  statement: '',
  files: [],
  messages: [],
  turns: 0,
  tokens: 0,
  submitResult: null,
}

export const useSessionStore = create((set) => ({
  ...EMPTY_SESSION,

  // begin a fresh run from the POST /attempts response
  startSession: ({ attemptId, problemId, statement, files }) =>
    set({
      ...EMPTY_SESSION,
      attemptId,
      problemId,
      statement: statement ?? '',
      files: files ?? [],
    }),

  // optimistic: show the lead's instruction immediately
  pushUserMessage: (text) =>
    set((s) => ({ messages: [...s.messages, { role: 'user', text }] })),

  // fold one POST /messages response into the transcript + counters
  applyAgentResult: ({ events, files, turns, tokens }) =>
    set((s) => ({
      messages: [...s.messages, ...eventsToMessages(events)],
      files: files ?? s.files,
      turns: turns ?? s.turns,
      tokens: tokens ?? s.tokens,
    })),

  setSubmitResult: (submitResult) => set({ submitResult }),

  resetSession: () => set({ ...EMPTY_SESSION }),
}))
