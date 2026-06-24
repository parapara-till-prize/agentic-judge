import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import Select from '../components/Select'
import { useProblem, useProblems, useLeaderboard } from '../api/queries'
import styles from '../styles/pages/Leaderboard.module.css'

const AVATAR_COLORS = ['#16a34a', '#2563eb', '#7c3aed', '#0891b2', '#d97706', '#db2777']

export default function Leaderboard() {
  const { id } = useParams() // undefined => global (all problems)
  const navigate = useNavigate()
  const { data: problem } = useProblem(id)
  const { data: problems } = useProblems()
  const { data: entries, isLoading, isError, error } = useLeaderboard(id)
  const [tab, setTab] = useState('score') // 'score' | 'turns'

  // problem picker: "전체" (global) + one option per problem
  const scopeOptions = useMemo(
    () => [
      { value: 'all', label: '전체 통합' },
      ...(problems ?? []).map((p) => ({ value: String(p.id), label: `#${p.id} ${p.title}` })),
    ],
    [problems],
  )
  const onScopeChange = (v) => navigate(v === 'all' ? '/leaderboard' : `/leaderboard/${v}`)

  const rows = useMemo(() => {
    const list = (entries ?? []).map((e, i) => ({
      ...e,
      initial: (e.user || '?').charAt(0).toUpperCase(),
      avBg: AVATAR_COLORS[i % AVATAR_COLORS.length],
    }))
    return tab === 'turns'
      ? [...list].sort((a, b) => a.turns - b.turns)
      : [...list].sort((a, b) => b.score - a.score)
  }, [entries, tab])

  return (
    <div className="app">
      <Navbar />
      <main className="page page--narrow">
        <div className={styles.stack}>
          {/* leaderboard card */}
          <div className="card card--flush">
            <div className={styles.lbHeader}>
              <div className={styles.lbHeadTop}>
                <div>
                  <div className={styles.lbTitle}>리더보드</div>
                  <div className={styles.lbSub}>
                    {id ? `#${id} ${problem?.title ?? ''}` : '전체 문제 통합 랭킹'}
                  </div>
                </div>
                <Select
                  value={id ?? 'all'}
                  onValueChange={onScopeChange}
                  options={scopeOptions}
                  ariaLabel="리더보드 범위"
                />
              </div>
              <div className={`tracks ${styles.tabs}`}>
                <button
                  className={tab === 'score' ? 'active' : ''}
                  onClick={() => setTab('score')}
                >
                  점수 랭킹
                </button>
                <button
                  className={tab === 'turns' ? 'active' : ''}
                  onClick={() => setTab('turns')}
                >
                  최소 턴 랭킹
                </button>
              </div>
            </div>

            <div className={styles.head}>
              <div>순위</div>
              <div>이름</div>
              <div className="t-right">점수</div>
              <div className="t-right">턴</div>
            </div>

            {rows.map((row, i) => (
              <div className={styles.row} key={row.user}>
                <div
                  className={`mono ${styles.rank}`}
                  style={{ color: i < 3 ? row.avBg : 'var(--text-muted)' }}
                >
                  {i + 1}
                </div>
                <div className={styles.name}>
                  <span className={styles.avatar} style={{ background: row.avBg }}>
                    {row.initial}
                  </span>
                  <span className={styles.nameText}>{row.user}</span>
                </div>
                <div className={`mono ${styles.cell}`}>{row.score}</div>
                <div className={`mono ${styles.cell}`}>{row.turns}</div>
              </div>
            ))}

            {isLoading && <div className={styles.state}>불러오는 중…</div>}
            {isError && (
              <div className={styles.state}>불러오지 못했어요. {error?.message}</div>
            )}
            {!isLoading && !isError && rows.length === 0 && (
              <div className={styles.state}>아직 제출 기록이 없어요.</div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
