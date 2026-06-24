import { create } from 'zustand'

// Client-only UI state for the problem list (filters + sort). Purely presentational —
// no server data lives here; the problem list itself comes from React Query.
export const useUiStore = create((set) => ({
  track: 'all',
  query: '',
  difficulty: 'all',
  skills: [],
  unsolvedOnly: false,
  sort: 'rate-desc',

  setTrack: (track) => set({ track }),
  setQuery: (query) => set({ query }),
  setDifficulty: (difficulty) => set({ difficulty }),
  toggleSkill: (s) =>
    set((st) => ({
      skills: st.skills.includes(s)
        ? st.skills.filter((x) => x !== s)
        : [...st.skills, s],
    })),
  clearSkills: () => set({ skills: [] }),
  setUnsolvedOnly: (unsolvedOnly) => set({ unsolvedOnly }),
  setSort: (sort) => set({ sort }),

  // global login modal (Navbar + Workspace both trigger it)
  loginOpen: false,
  openLogin: () => set({ loginOpen: true }),
  closeLogin: () => set({ loginOpen: false }),
  setLoginOpen: (loginOpen) => set({ loginOpen }),
}))
