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

// Parse a run_command output (pytest) into a compact pass/fail summary for the right pane.
function parseTestOutput(command, output = '') {
  const num = (re) => {
    const m = output.match(re)
    return m ? Number(m[1]) : 0
  }
  const passed = num(/(\d+) passed/)
  const failed = num(/(\d+) failed/) + num(/(\d+) error/)
  const total = passed + failed
  return {
    command,
    raw: output,
    passed,
    failed,
    total,
    ok: total > 0 && failed === 0,
    ran: total > 0, // false for non-test commands (ls, cat, …)
  }
}

const EMPTY_SESSION = {
  attemptId: null,
  problemId: null,
  statement: '',
  files: [],
  messages: [],
  turns: 0,
  tokens: 0,
  testResult: null,
  agentBusy: false,
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

  // optimistic: show the lead's instruction immediately + mark the turn in-flight
  pushUserMessage: (text) =>
    set((s) => ({ messages: [...s.messages, { role: 'user', text }], agentBusy: true })),

  // --- streamed turn (SSE) — fold events into the transcript as they arrive ----------
  // a tool call: attach a chip to the trailing agent bubble (open one if needed)
  streamToolCall: (ev) =>
    set((s) => {
      const msgs = [...s.messages]
      const last = msgs[msgs.length - 1]
      if (last && last.role === 'agent') {
        msgs[msgs.length - 1] = { ...last, tools: [...(last.tools ?? []), toolChip(ev)] }
      } else {
        msgs.push({ role: 'agent', text: '', tools: [toolChip(ev)] })
      }
      return { messages: msgs }
    }),

  // assistant text: fill the trailing empty agent bubble, else open a new one
  streamAgentText: (ev) =>
    set((s) => {
      const msgs = [...s.messages]
      const last = msgs[msgs.length - 1]
      if (last && last.role === 'agent' && !last.text) {
        msgs[msgs.length - 1] = { ...last, text: ev.text }
      } else {
        msgs.push({ role: 'agent', text: ev.text, tools: [] })
      }
      return { messages: msgs }
    }),

  // live file snapshot pushed after each write_file
  streamFiles: (files) => set({ files: files ?? [] }),

  // latest run_command result -> right-pane test panel
  streamTestResult: (ev) =>
    set({ testResult: parseTestOutput(ev.command, ev.output) }),

  // terminal `done` event: authoritative counters + final snapshot
  finishTurn: ({ turns, tokens, files }) =>
    set((s) => ({
      turns: turns ?? s.turns,
      tokens: tokens ?? s.tokens,
      files: files ?? s.files,
      agentBusy: false,
    })),

  endTurnError: () => set({ agentBusy: false }),

  setSubmitResult: (submitResult) => set({ submitResult }),

  resetSession: () => set({ ...EMPTY_SESSION }),
}))
