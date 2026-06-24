// React Query hooks = the server-state layer. Every backend read/write goes through here;
// components never call fetch directly. Client-only UI state lives in the zustand stores.
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiFetch } from './client'

export const keys = {
  me: ['me'],
  problems: ['problems'],
  problem: (id) => ['problems', id],
  leaderboard: (problemId) => ['leaderboard', problemId ?? 'all'],
}

// --- auth ------------------------------------------------------------------
// The session lives in an httponly cookie; the client only knows "who am I" via /auth/me.
// A 401 is the normal logged-out state, so don't retry it and treat null as anonymous.
export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return await apiFetch('/auth/me')
      } catch {
        return null // 401 / not authenticated -> anonymous
      }
    },
    retry: false,
    staleTime: 5 * 60_000,
  })
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ username, password }) =>
      apiFetch('/auth/login', { method: 'POST', body: { username, password } }),
    onSuccess: (data) => {
      qc.setQueryData(keys.me, data)
      qc.invalidateQueries() // identity changed -> refetch user-scoped data (solved status, etc.)
      toast.success('성공적으로 로그인했어요')
    },
  })
}

export function useRegister() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ username, password }) =>
      apiFetch('/auth/register', { method: 'POST', body: { username, password } }),
    onSuccess: (data) => {
      qc.setQueryData(keys.me, data)
      qc.invalidateQueries() // identity changed -> refetch user-scoped data (solved status, etc.)
      toast.success('성공적으로 회원가입했어요')
    },
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      qc.setQueryData(keys.me, null)
      qc.invalidateQueries() // identity changed -> refetch anything user-scoped
      toast.success('성공적으로 로그아웃했어요')
    },
    onError: (e) => toast.error('로그아웃하지 못했어요', { description: e.message }),
  })
}

// --- reads -----------------------------------------------------------------
export function useProblems() {
  return useQuery({
    queryKey: keys.problems,
    queryFn: () => apiFetch('/problems'),
  })
}

export function useProblem(id) {
  return useQuery({
    queryKey: keys.problem(id),
    queryFn: () => apiFetch(`/problems/${id}`),
    enabled: Boolean(id),
  })
}

export function useLeaderboard(problemId) {
  const qs = problemId ? `?problem_id=${encodeURIComponent(problemId)}` : ''
  return useQuery({
    queryKey: keys.leaderboard(problemId),
    queryFn: () => apiFetch(`/leaderboard${qs}`),
  })
}

// --- mutations -------------------------------------------------------------
export function useStartAttempt() {
  // user is taken from the session cookie server-side; no user field in the body.
  return useMutation({
    mutationFn: ({ problemId }) =>
      apiFetch('/attempts', {
        method: 'POST',
        body: { problem_id: problemId },
      }),
  })
}

export function usePostMessage(attemptId) {
  return useMutation({
    mutationFn: (text) =>
      apiFetch(`/attempts/${attemptId}/messages`, {
        method: 'POST',
        body: { text },
      }),
  })
}

export function useSaveFile(attemptId) {
  // direct file edit -> backend writes it into the attempt workdir (the source of truth),
  // so local tests + submission pick up the change. Returns the fresh file snapshot.
  return useMutation({
    mutationFn: ({ path, content }) =>
      apiFetch(`/attempts/${attemptId}/files`, {
        method: 'PUT',
        body: { path, content },
      }),
  })
}

export function useRunTests(attemptId) {
  // manual visible-test run -> container executes the problem's test_cmd, returns
  // {command, output}. Lets a user verify direct edits without waiting on the agent.
  return useMutation({
    mutationFn: () =>
      apiFetch(`/attempts/${attemptId}/run-tests`, { method: 'POST' }),
  })
}

export function useSubmit(attemptId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiFetch(`/attempts/${attemptId}/submit`, { method: 'POST' }),
    onSuccess: () => {
      // a graded submission moves solved_rate + leaderboard
      qc.invalidateQueries({ queryKey: keys.problems })
      qc.invalidateQueries({ queryKey: ['leaderboard'] })
    },
  })
}

// AI tutor feedback for the submit screen. Same hosted model as the agent, different prompt:
// sends the failed hidden-case ids (from the submit result) and gets back a holistic eval +
// one no-spoiler hint per failed case. Slow (one LLM call) -> the modal shows a spinner.
export function useFeedback(attemptId) {
  return useMutation({
    mutationFn: (failedTests) =>
      apiFetch(`/attempts/${attemptId}/feedback`, {
        method: 'POST',
        body: { failed_tests: failedTests ?? [] },
      }),
  })
}
