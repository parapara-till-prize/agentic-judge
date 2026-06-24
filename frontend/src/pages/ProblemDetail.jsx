import { useNavigate, useParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { Badge, Chip } from '../components/ui'
import { PROBLEMS, PROBLEM_DETAIL } from '../data/mock'
import styles from './ProblemDetail.module.css'

export default function ProblemDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const problem = PROBLEMS.find((p) => String(p.id) === id) || PROBLEMS[0]
  const d = PROBLEM_DETAIL

  return (
    <div className="app">
      <Navbar />
      <main className="page page--narrow">
        <div className="card card--flush">
          {/* header */}
          <div className={styles.header}>
            <div className={styles.meta}>
              <span className={`mono ${styles.metaId}`}>#{problem.id}</span>
              <Badge difficulty={problem.difficulty} />
              {problem.skills.map((s) => (
                <Chip key={s}>{s}</Chip>
              ))}
            </div>
            <div className={styles.title}>{problem.title}</div>

            <div className={styles.stats}>
              <div>
                <div className={styles.statLabel}>성공률</div>
                <div className={`mono ${styles.statValue}`}>
                  {problem.rate.toFixed(1)}%
                </div>
              </div>
              <div>
                <div className={styles.statLabel}>평균 턴 수</div>
                <div className={`mono ${styles.statValue}`}>
                  {problem.avgTurns ?? '—'}
                </div>
              </div>
              <div>
                <div className={styles.statLabel}>제출자</div>
                <div className={`mono ${styles.statValue}`}>
                  {problem.submitters?.toLocaleString() ?? '—'}
                </div>
              </div>
              <div>
                <div className={styles.statLabel}>최소 턴 기록</div>
                <div className={`mono ${styles.statValue} ${styles.statValueAccent}`}>
                  {problem.bestTurns ?? '—'}
                </div>
              </div>
            </div>
          </div>

          {/* body */}
          <div className={styles.body}>
            <Section title="문제">{d.body}</Section>
            <Section title="입력 / 출력">{d.io}</Section>

            <div className={styles.examples}>
              <div>
                <div className="frame-label" style={{ marginBottom: 6 }}>
                  예제 입력
                </div>
                <pre className="mono code-block">{d.sampleInput}</pre>
              </div>
              <div>
                <div className="frame-label" style={{ marginBottom: 6 }}>
                  예제 출력
                </div>
                <pre className="mono code-block">{d.sampleOutput}</pre>
              </div>
            </div>

            <div>
              <div className={styles.sectionTitle}>제약 조건</div>
              <ul className={styles.constraints}>
                {d.constraints.map((c) => (
                  <li key={c}>
                    <span className="mono">{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* footer */}
          <div className={styles.footer}>
            <div className={styles.footerNote}>
              규칙 · 코드 직접 입력 불가 / 에이전트 지시로만 해결
            </div>
            <button
              className="btn btn--primary btn--lg"
              onClick={() => navigate(`/workspace/${problem.id}`)}
            >
              풀기 시작 →
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <div className={styles.sectionTitle}>{title}</div>
      <div className={styles.sectionBody}>{children}</div>
    </div>
  )
}
