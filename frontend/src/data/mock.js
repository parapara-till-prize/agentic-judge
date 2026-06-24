// Mock data for the Agentic Coding Arena.
// Mirrors the content shown in the 에이전틱 코딩 평가 design canvas.

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

export const PROBLEMS = [
  {
    id: 1024,
    title: '구간 합 빠르게 구하기',
    domain: 'algorithm',
    difficulty: 'mid',
    skills: ['누적합', '자료구조'],
    rate: 47.2,
    solved: true,
    avgTurns: 8.4,
    submitters: 3182,
    bestTurns: 3,
  },
  {
    id: 2207,
    title: '사용자 목록 페이지네이션 쿼리',
    domain: 'sql',
    difficulty: 'basic',
    skills: ['JOIN', 'LIMIT'],
    rate: 61.5,
    solved: false,
  },
  {
    id: 3104,
    title: '반응형 가격표 컴포넌트',
    domain: 'frontend',
    difficulty: 'mid',
    skills: ['레이아웃', '반응형'],
    rate: 38.0,
    solved: false,
  },
  {
    id: 4011,
    title: '매출 상위 N 집계',
    domain: 'sql',
    difficulty: 'mid',
    skills: ['GROUP BY', '윈도우'],
    rate: 33.5,
    solved: false,
  },
  {
    id: 3140,
    title: '모달 접근성(a11y) 수정',
    domain: 'frontend',
    difficulty: 'basic',
    skills: ['접근성', '키보드'],
    rate: 52.7,
    solved: true,
  },
  {
    id: 1156,
    title: '로그 파일 재정렬 API',
    domain: 'backend',
    difficulty: 'hard',
    skills: ['정렬', '파싱'],
    rate: 21.8,
    solved: false,
  },
  {
    id: 1031,
    title: '괄호 짝 맞추기',
    domain: 'algorithm',
    difficulty: 'basic',
    skills: ['스택', '문자열'],
    rate: 68.1,
    solved: false,
  },
]

// unique, sorted list of every skill used across problems
export const ALL_SKILLS = [
  ...new Set(PROBLEMS.flatMap((p) => p.skills)),
].sort((a, b) => a.localeCompare(b, 'ko'))

export const PROBLEM_DETAIL = {
  id: 1024,
  body: '길이 N인 정수 배열과 M개의 질의가 주어진다. 각 질의 (i, j)에 대해 i번째부터 j번째 원소까지의 합을 구해 출력하라. N, M ≤ 10⁵ 이므로 매 질의를 단순 반복으로 더하면 시간 안에 통과할 수 없다.',
  io: '첫 줄에 N M, 둘째 줄에 N개의 정수. 이후 M개의 줄에 질의 i j가 주어진다. 각 질의의 구간 합을 한 줄에 하나씩 출력한다.',
  sampleInput: '5 3\n5 4 3 2 1\n1 3\n2 4\n1 5',
  sampleOutput: '12\n9\n15',
  constraints: [
    '1 ≤ N, M ≤ 100,000',
    '−1,000 ≤ A[k] ≤ 1,000',
    '시간 제한 1초 · 메모리 256MB',
  ],
}

// workspace chat transcript
export const TRANSCRIPT = [
  {
    role: 'user',
    text: 'solution.py 만들어줘. 표준입력으로 N M, 배열, 질의 받아서 각 구간 합을 출력하는 골격부터.',
  },
  {
    role: 'agent',
    text: '네, 입력 파싱 골격을 만들고 각 질의를 단순 반복으로 더하는 버전을 먼저 작성했습니다.',
    tools: [{ kind: 'write', label: '⊞ write_file · solution.py' }],
  },
  { role: 'user', text: '예제는 통과해? 일단 돌려봐.' },
  {
    role: 'agent',
    text: '예제 테스트는 3/3 통과했습니다. 다만 N,M이 최대일 때 매 질의마다 구간을 더하면 O(N·M)이라 시간 초과 위험이 있습니다.',
    tools: [
      { kind: 'read', label: '⊟ read_file · solution.py' },
      { kind: 'run', label: '▶ run_tests · 3 passed' },
    ],
  },
  {
    role: 'user',
    text: '맞아, 그럼 누적합으로 바꿔. 질의는 O(1)로. 인덱스 경계 조심하고.',
  },
  {
    role: 'agent',
    typing: true,
    text: 'prefix 배열을 만들어 prefix[j] − prefix[i−1] 로 계산하도록 수정 중입니다…',
  },
]

export const CODE_LINES = [
  [['kw', 'import'], ['', ' sys']],
  [['', 'data = sys.stdin.read().split()']],
  [['', 'idx = '], ['num', '0']],
  [['', 'N, M = '], ['fn', 'int'], ['', '(data[idx]), '], ['fn', 'int'], ['', '(data[idx+'], ['num', '1'], ['', '])']],
  [['', 'idx += '], ['num', '2']],
  [['', 'A = ['], ['fn', 'int'], ['', '(x) '], ['kw', 'for'], ['', ' x '], ['kw', 'in'], ['', ' data[idx:idx+N]]']],
  [['', 'prefix = ['], ['num', '0'], ['', ']*(N+'], ['num', '1'], ['', ')']],
  [['kw', 'for'], ['', ' k '], ['kw', 'in'], ['', ' '], ['fn', 'range'], ['', '(N):']],
  [['', '    prefix[k+'], ['num', '1'], ['', '] = prefix[k] + A[k]']],
  [['cmt', '# 질의 처리 부분 수정 중…']],
]

export const PUBLIC_TESTS = [
  { name: 'case #1', ms: '2ms', pass: true },
  { name: 'case #2', ms: '2ms', pass: true },
  { name: 'case #3', ms: '3ms', pass: true },
]

// result page
export const RESULT = {
  problemId: 1024,
  title: '구간 합 빠르게 구하기',
  score: 920,
  max: 1000,
  hiddenPass: 18,
  hiddenTotal: 20,
  turns: 12,
  tokens: '28.6k',
  effRank: 'B+',
  preset: '알고리즘 가중치 프리셋',
  criteria: [
    { label: '정확도', note: '히든 통과', weight: '×50%', pct: 90, tone: 'ok', detail: '90 → 450' },
    { label: '효율', note: '턴·토큰', weight: '×20%', pct: 68, tone: 'warn', detail: '68 → 136' },
    { label: '코드 품질', note: '정적분석', weight: '×15%', pct: 84, tone: 'ok', detail: '84 → 126' },
    { label: '지시 명료성', note: '리뷰 정밀도', weight: '×15%', pct: 72, tone: 'warn', detail: '72 → 108' },
  ],
  hiddenCases: Array.from({ length: 20 }, (_, i) => ![4, 11].includes(i)),
  failedCases: ['#5', '#12'],
}

// leaderboard
export const LEADERBOARD = [
  { rank: 1, name: '김도윤', initial: 'D', avBg: '#16a34a', rate: '100%', score: 1000, turns: 4, rankColor: '#16a34a' },
  { rank: 2, name: '이서연', initial: 'S', avBg: '#2563eb', rate: '100%', score: 980, turns: 5, rankColor: '#2563eb' },
  { rank: 3, name: '박지호', initial: 'J', avBg: '#7c3aed', rate: '95%', score: 945, turns: 6, rankColor: '#7c3aed' },
  { rank: 4, name: '최유진', initial: 'Y', avBg: '#0891b2', rate: '95%', score: 930, turns: 8, rankColor: '#6b6b6b' },
  { rank: 5, name: 'Kim (나)', initial: 'K', avBg: '#16a34a', rate: '90%', score: 920, turns: 12, rankColor: '#6b6b6b' },
  { rank: 6, name: '정민서', initial: 'M', avBg: '#d97706', rate: '90%', score: 910, turns: 9, rankColor: '#6b6b6b' },
]

// domain-scoring module presets
export const SCORING_PRESETS = [
  {
    domain: 'algorithm',
    axes: [
      { label: '정확도', val: 50, primary: true },
      { label: '효율(턴·토큰)', val: 25 },
      { label: '시간복잡도', val: 25 },
    ],
  },
  {
    domain: 'frontend',
    axes: [
      { label: '시각 일치도', val: 35, primary: true },
      { label: '접근성(a11y)', val: 25 },
      { label: '상호작용 통과', val: 25 },
      { label: '효율', val: 15 },
    ],
  },
  {
    domain: 'sql',
    axes: [
      { label: '결과셋 일치', val: 55, primary: true },
      { label: '쿼리 효율(plan)', val: 25 },
      { label: '효율(턴)', val: 20 },
    ],
  },
]
