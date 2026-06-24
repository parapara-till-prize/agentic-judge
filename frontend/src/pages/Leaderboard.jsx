import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { DomainTag } from '../components/ui'
import { LEADERBOARD, PROBLEMS, SCORING_PRESETS } from '../data/mock'
import styles from './Leaderboard.module.css'

export default function Leaderboard() {
  const { id } = useParams()
  const problem = PROBLEMS.find((p) => String(p.id) === id) || PROBLEMS[0]
  const [tab, setTab] = useState('rate') // 'rate' | 'turns'

  const rows = useMemo(() => {
    const list = [...LEADERBOARD]
    return tab === 'turns'
      ? list.sort((a, b) => a.turns - b.turns)
      : list.sort((a, b) => b.score - a.score)
  }, [tab])

  const col3 = tab === 'turns' ? '최소 턴' : '정답률'
  const col4 = '점수'

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
                #{problem.id} {problem.title}
              </div>
              <div className={`tracks ${styles.tabs}`}>
                <button
                  className={tab === 'rate' ? 'active' : ''}
                  onClick={() => setTab('rate')}
                >
                  정답률 랭킹
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
              <div className="t-right">{col3}</div>
              <div className="t-right">{col4}</div>
              <div className="t-right">평균 턴</div>
            </div>

            {rows.map((row, i) => (
              <div className={styles.row} key={row.name}>
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
                  <span className={styles.nameText}>{row.name}</span>
                </div>
                <div className={`mono ${styles.cell}`}>
                  {tab === 'turns' ? row.turns : row.rate}
                </div>
                <div className={`mono ${styles.cell}`}>{row.score}</div>
                <div className={`mono ${styles.cell}`}>{row.turns}</div>
              </div>
            ))}
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
