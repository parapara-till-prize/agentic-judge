import { useNavigate, useParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { Badge, Chip } from '../components/ui'
import Markdown from '../components/Markdown'
import { useProblem } from '../api/queries'
import styles from '../styles/pages/ProblemDetail.module.css'

export default function ProblemDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: problem, isLoading, isError, error } = useProblem(id)

  if (isLoading) {
    return <Shell><div className={styles.state}>문제를 불러오는 중…</div></Shell>
  }
  if (isError || !problem) {
    return (
      <Shell>
        <div className={styles.state}>문제를 불러오지 못했어요. {error?.message}</div>
      </Shell>
    )
  }

  const rate = ((problem.solved_rate ?? 0) * 100).toFixed(1)

  return (
    <Shell>
      <div className="card card--flush">
        {/* header */}
        <div className={styles.header}>
          <div className={styles.meta}>
            <span className={`mono ${styles.metaId}`}>#{problem.id}</span>
            <Badge difficulty={problem.difficulty} />
            {(problem.skills ?? []).map((s) => (
              <Chip key={s}>{s}</Chip>
            ))}
          </div>
          <div className={styles.title}>{problem.title}</div>

          <div className={styles.stats}>
            <Stat label="성공률" value={`${rate}%`} />
            <Stat label="평균 턴 수" value={problem.avg_turns ?? '—'} />
            <Stat label="제출자" value={problem.submitters?.toLocaleString() ?? '0'} />
            <Stat
              label="최소 턴 기록"
              value={problem.best_turns ?? '—'}
              accent
            />
          </div>
        </div>

        {/* body */}
        <div className={styles.body}>
          <Markdown source={problem.statement} />
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
    </Shell>
  )
}

function Shell({ children }) {
  return (
    <div className="app">
      <Navbar />
      <main className="page page--narrow">{children}</main>
    </div>
  )
}

function Stat({ label, value, accent }) {
  return (
    <div>
      <div className={styles.statLabel}>{label}</div>
      <div
        className={`mono ${styles.statValue}${accent ? ` ${styles.statValueAccent}` : ''}`}
      >
        {value}
      </div>
    </div>
  )
}
