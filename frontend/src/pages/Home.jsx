import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import Select from '../components/Select'
import SkillFilter from '../components/SkillFilter'
import Toggle from '../components/Toggle'
import { Badge, DomainTag, Chip, StatusDot } from '../components/ui'
import { PROBLEMS, TRACKS, ALL_SKILLS } from '../data/mock'
import styles from './Home.module.css'

const DIFFICULTY_OPTIONS = [
  { value: 'all', label: '전체 난이도' },
  { value: 'intro', label: '입문' },
  { value: 'basic', label: '초급' },
  { value: 'mid', label: '중급' },
  { value: 'hard', label: '고급' },
]

const SORT_OPTIONS = [
  { value: 'rate-desc', label: '정렬: 성공률 높은순' },
  { value: 'rate-asc', label: '정렬: 성공률 낮은순' },
  { value: 'id-asc', label: '정렬: 번호순' },
]

export default function Home() {
  const navigate = useNavigate()
  const [track, setTrack] = useState('all')
  const [query, setQuery] = useState('')
  const [difficulty, setDifficulty] = useState('all')
  const [skills, setSkills] = useState([])
  const [unsolvedOnly, setUnsolvedOnly] = useState(false)
  const [sort, setSort] = useState('rate-desc')

  const rows = useMemo(() => {
    const filtered = PROBLEMS.filter((p) => {
      if (track !== 'all' && p.domain !== track) return false
      if (difficulty !== 'all' && p.difficulty !== difficulty) return false
      if (skills.length && !skills.every((s) => p.skills.includes(s))) return false
      if (unsolvedOnly && p.solved) return false
      if (query && !p.title.includes(query) && !String(p.id).includes(query))
        return false
      return true
    })
    const sorted = [...filtered]
    if (sort === 'rate-desc') sorted.sort((a, b) => b.rate - a.rate)
    else if (sort === 'rate-asc') sorted.sort((a, b) => a.rate - b.rate)
    else if (sort === 'id-asc') sorted.sort((a, b) => a.id - b.id)
    return sorted
  }, [track, query, difficulty, skills, unsolvedOnly, sort])

  const toggleSkill = (s) =>
    setSkills((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))

  return (
    <div className="app">
      <Navbar />
      <main className="page">
        <div className="card card--flush">
          {/* hero */}
          <div className={styles.hero}>
            <div className={styles.kicker}>AGENTIC&nbsp;CODING&nbsp;ARENA</div>
            <div className={styles.title}>AI를 부려서 코드를 짜라.</div>
            <div className={styles.sub}>
              당신은 테크리드, AI는 주니어. 한 줄도 직접 타이핑하지 않고{' '}
              <b>자연어 지시</b>만으로 문제를 통과시켜라.
            </div>
          </div>

          {/* domain tracks */}
          <div className="tracks">
            {TRACKS.map((t) => (
              <button
                key={t.key}
                className={track === t.key ? 'active' : ''}
                disabled={t.disabled}
                onClick={() => setTrack(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* toolbar */}
          <div className={styles.toolbar}>
            <label className={styles.search}>
              ⌕
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="문제 검색…"
              />
            </label>
            <div className={styles.filters}>
              <Select
                value={difficulty}
                onValueChange={setDifficulty}
                options={DIFFICULTY_OPTIONS}
                ariaLabel="난이도 필터"
              />
              <SkillFilter
                skills={ALL_SKILLS}
                selected={skills}
                onToggle={toggleSkill}
                onClear={() => setSkills([])}
              />
              <Toggle pressed={unsolvedOnly} onPressedChange={setUnsolvedOnly}>
                미해결만
              </Toggle>
              <Select
                value={sort}
                onValueChange={setSort}
                options={SORT_OPTIONS}
                ariaLabel="정렬 기준"
              />
            </div>
          </div>

          {/* table */}
          <div className={styles.head}>
            <div>#</div>
            <div>제목</div>
            <div>도메인</div>
            <div>난이도</div>
            <div>스킬</div>
            <div className="t-right">통과율</div>
            <div className="t-center">상태</div>
          </div>

          {rows.map((p) => (
            <div
              key={p.id}
              className={styles.row}
              onClick={() => navigate(`/problem/${p.id}`)}
            >
              <div className={`mono ${styles.id}`}>{p.id}</div>
              <div className={styles.cellTitle}>{p.title}</div>
              <div>
                <DomainTag domain={p.domain} />
              </div>
              <div>
                <Badge difficulty={p.difficulty} />
              </div>
              <div className={styles.skills}>
                {p.skills.map((s) => (
                  <Chip key={s}>{s}</Chip>
                ))}
              </div>
              <div className={`mono ${styles.rate}`}>{p.rate.toFixed(1)}%</div>
              <div className="t-center">
                <StatusDot solved={p.solved} />
              </div>
            </div>
          ))}

          {rows.length === 0 && (
            <div className={styles.empty}>조건에 맞는 문제가 없습니다.</div>
          )}
        </div>
      </main>
    </div>
  )
}
