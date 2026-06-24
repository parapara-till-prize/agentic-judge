import { useNavigate, useParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { RESULT } from '../data/mock'
import styles from './Result.module.css'

export default function Result() {
  const { id } = useParams()
  const navigate = useNavigate()
  const r = RESULT
  const pid = id || r.problemId

  return (
    <div className="app">
      <Navbar />
      <main className="page page--narrow">
        <div className="card card--flush">
          {/* score header */}
          <div className={styles.scoreHeader}>
            <div className={styles.ring}>
              <div className={`mono ${styles.ringNum}`}>{r.score}</div>
              <div className={styles.ringDen}>/ {r.max}</div>
            </div>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div className={styles.passLabel}>통과</div>
              <div className={styles.title}>{r.title}</div>
              <div className={styles.headStats}>
                <Stat label="히든 통과" value={`${r.hiddenPass} / ${r.hiddenTotal}`} />
                <Stat label="사용 턴" value={r.turns} />
                <Stat label="토큰" value={r.tokens} />
                <Stat label="효율 랭크" value={r.effRank} color="var(--warn)" />
              </div>
            </div>
          </div>

          {/* modular scorecard */}
          <Section
            title={
              <>
                점수 구성{' '}
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-dim)' }}>
                  · 가중치는 도메인/문제별 구성 (확정 전)
                </span>
              </>
            }
            aside={<span className={styles.presetTag}>{r.preset}</span>}
          >
            <div className={styles.criteria}>
              {r.criteria.map((c) => (
                <div className={styles.criterion} key={c.label}>
                  <div className={styles.critLabel}>
                    {c.label} <span className={styles.critNote}>{c.note}</span>
                  </div>
                  <div className={`mono ${styles.critWeight}`}>{c.weight}</div>
                  <div className={`${styles.bar} ${styles[c.tone]}`}>
                    <span style={{ width: `${c.pct}%` }} />
                  </div>
                  <div className={`mono ${styles.critDetail}`}>{c.detail}</div>
                </div>
              ))}
              <div className={styles.criterion} style={{ opacity: 0.45 }}>
                <div className={styles.critLabel}>
                  + 축 추가 <span className={styles.critNote}>도메인별 플러그인</span>
                </div>
                <div className={`mono ${styles.critWeight}`}>×—</div>
                <div className={`${styles.bar} ${styles.barDashed}`} />
                <div className={`mono ${styles.critDetail}`} style={{ color: 'var(--text-dim)' }}>
                  —
                </div>
              </div>
            </div>
          </Section>

          {/* hidden test grid */}
          <Section
            title="히든 테스트 현황"
            aside={
              <span className="mono" style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>
                {r.hiddenPass} 통과 ·{' '}
                <span style={{ color: 'var(--danger)' }}>
                  {r.hiddenTotal - r.hiddenPass} 실패
                </span>
              </span>
            }
          >
            <div className={styles.hiddenGrid}>
              {r.hiddenCases.map((pass, i) => (
                <div
                  key={i}
                  className={`${styles.hcell} ${pass ? styles.hPass : styles.hFail}`}
                >
                  {pass ? '✓' : '✕'}
                </div>
              ))}
            </div>
            <div className={styles.hiddenNote}>
              실패 케이스 <span className="mono">{r.failedCases.join(', ')}</span> — 음수 누적과
              경계 인덱스에서 갈림. 상세 입력은 비공개.
            </div>
          </Section>

          {/* coaching */}
          <Section title="축별 비교 & 코칭">
            <div className={styles.compareGrid}>
              <Compare label="효율 · 사용 턴" you="12턴" youPct={100} youColor="var(--warn)" top="4턴" topPct={33} />
              <Compare label="정확도 · 히든 통과" you="90%" youPct={90} youColor="var(--accent)" top="100%" topPct={100} />
            </div>
            <div className={styles.coaching}>
              <b style={{ color: 'var(--text-h)' }}>어디서 갈렸나</b>
              <br />· <span style={{ color: 'var(--warn)', fontWeight: 600 }}>효율</span>: 턴 3–7을
              단순 반복 버전에 소비. 상위 solver는 첫 지시에서 바로{' '}
              <span className="mono">누적합</span> 자료구조를 요구했습니다.
              <br />· <span style={{ color: 'var(--danger)', fontWeight: 600 }}>정확도</span>:{' '}
              <span className="mono">prefix[i−1]</span> 경계를 직접 짚지 않아 음수 케이스 2개 실패.
              “<span className="mono">i=1</span>일 때 확인해줘”처럼 엣지를 명시했다면 둘 다 막을 수
              있었습니다.
            </div>
          </Section>

          {/* footer */}
          <div className={styles.footer}>
            <button className="btn btn--ghost btn--block btn--lg" onClick={() => navigate(`/workspace/${pid}`)}>
              다시 풀기
            </button>
            <button className="btn btn--primary btn--block btn--lg" onClick={() => navigate(`/leaderboard/${pid}`)}>
              리더보드 보기 →
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div className={styles.statLabel}>{label}</div>
      <div className={`mono ${styles.statValue}`} style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  )
}

function Section({ title, aside, children }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <div className={styles.sectionTitle}>{title}</div>
        {aside}
      </div>
      {children}
    </div>
  )
}

function Compare({ label, you, youPct, youColor, top, topPct }) {
  return (
    <div>
      <div className={styles.compareLabel}>{label}</div>
      <Row name="당신" value={you} color={youColor} />
      <div className={`${styles.bar} ${styles.ok}`} style={{ marginBottom: 8 }}>
        <span style={{ width: `${youPct}%`, background: youColor }} />
      </div>
      <Row name="상위 solver" value={top} color="var(--accent)" />
      <div className={`${styles.bar} ${styles.ok}`}>
        <span style={{ width: `${topPct}%` }} />
      </div>
    </div>
  )
}

function Row({ name, value, color }) {
  return (
    <div className={styles.compareRow}>
      <span>{name}</span>
      <span className="mono" style={{ color }}>
        {value}
      </span>
    </div>
  )
}
