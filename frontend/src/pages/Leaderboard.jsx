import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { DomainTag } from '../components/ui'
import { SCORING_PRESETS } from '../data/mock'
import { useProblem, useLeaderboard } from '../api/queries'
import styles from './Leaderboard.module.css'

const AVATAR_COLORS = ['#16a34a', '#2563eb', '#7c3aed', '#0891b2', '#d97706', '#db2777']

export default function Leaderboard() {
  const { id } = useParams()
  const { data: problem } = useProblem(id)
  const { data: entries, isLoading, isError, error } = useLeaderboard(id)
  const [tab, setTab] = useState('passed') // 'passed' | 'turns'

  const rows = useMemo(() => {
    const list = (entries ?? []).map((e, i) => ({
      ...e,
      initial: (e.user || '?').charAt(0).toUpperCase(),
      avBg: AVATAR_COLORS[i % AVATAR_COLORS.length],
    }))
    return tab === 'turns'
      ? [...list].sort((a, b) => a.turns - b.turns)
      : [...list].sort((a, b) => b.passed - a.passed)
  }, [entries, tab])

  return (
    <div className="app">
      <Navbar />
      <main className="page page--narrow">
        <div className={styles.stack}>
          {/* leaderboard card */}
          <div className="card card--flush">
            <div className={styles.lbHeader}>
              <div className={styles.lbTitle}>리더보드</div>
              <div className={styles.lbSub}>
                #{id} {problem?.title ?? ''}
              </div>
              <div className={`tracks ${styles.tabs}`}>
                <button
                  className={tab === 'passed' ? 'active' : ''}
                  onClick={() => setTab('passed')}
                >
                  통과 랭킹
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
              <div className="t-right">통과</div>
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
                <div className={`mono ${styles.cell}`}>{row.passed}</div>
                <div className={`mono ${styles.cell}`}>{row.turns}</div>
              </div>
            ))}

            {isLoading && <div className={styles.state}>불러오는 중…</div>}
            {isError && (
              <div className={styles.state}>불러오지 못했습니다. {error?.message}</div>
            )}
            {!isLoading && !isError && rows.length === 0 && (
              <div className={styles.state}>아직 제출 기록이 없습니다.</div>
            )}
          </div>

          {/* domain-scoring module explainer */}
          <div className={`card ${styles.explainer}`}>
            <div className={styles.explainerTitle}>평가 축은 도메인마다 조립한다</div>
            <div className={styles.explainerSub}>
              '턴'은 효율 축의 한 지표일 뿐. 도메인별로 채점 모듈과 가중치를 다르게 끼운다.{' '}
              <span style={{ color: 'var(--text-dim)' }}>
                (가중치 미정 — 구성 가능 구조로 설계)
              </span>
            </div>
            <div className={styles.presets}>
              {SCORING_PRESETS.map((preset) => (
                <div key={preset.domain} className={styles.preset}>
                  <div style={{ marginBottom: 9 }}>
                    <DomainTag domain={preset.domain} />
                  </div>
                  <div className={styles.axes}>
                    {preset.axes.map((a) => (
                      <span
                        key={a.label}
                        className={`${styles.axis}${a.primary ? ` ${styles.axisPrimary}` : ''}`}
                      >
                        {a.label} <b className="mono">{a.val}</b>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
