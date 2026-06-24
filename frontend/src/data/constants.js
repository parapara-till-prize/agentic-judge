// Static UI config shared across pages (domain/difficulty styling + track tabs).

export const DOMAINS = {
  algorithm: { label: '알고리즘', bg: '#f1f5f9', fg: '#475569' },
  frontend: { label: '프론트엔드', bg: '#f5f3ff', fg: '#7c3aed' },
  sql: { label: 'SQL', bg: '#fffbeb', fg: '#b45309' },
  backend: { label: '백엔드', bg: '#f0fdfa', fg: '#0d9488' },
}

// difficulty -> badge modifier class suffix
export const DIFFICULTY = {
  intro: { label: '입문', cls: 'intro' },
  basic: { label: '초급', cls: 'basic' },
  mid: { label: '중급', cls: 'mid' },
  hard: { label: '고급', cls: 'hard' },
}

export const TRACKS = [
  { key: 'all', label: '전체' },
  { key: 'algorithm', label: '알고리즘' },
  { key: 'frontend', label: '프론트엔드' },
  { key: 'sql', label: 'SQL' },
  { key: 'backend', label: '백엔드' },
  { key: 'data', label: '데이터 +', disabled: true },
]
