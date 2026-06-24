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
