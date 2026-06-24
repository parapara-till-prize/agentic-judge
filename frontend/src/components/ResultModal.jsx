import { useNavigate } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { Close } from '@carbon/icons-react'
import { RESULT } from '../data/mock'
import { useProblem } from '../api/queries'
import { useSessionStore } from '../store/sessionStore'
import styles from '../pages/Result.module.css'

const fmtTokens = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n ?? 0))

const AXIS_NOTE = {
  accuracy: '히든 통과',
  turn_efficiency: '턴 수',
  token_efficiency: '토큰 수',
}

const toneFor = (pct) => (pct >= 75 ? 'ok' : pct >= 50 ? 'warn' : 'danger')

const axesToCriteria = (axes) =>
  axes.map((a) => ({
    label: a.label,
    note: AXIS_NOTE[a.key] ?? '',
    weight: `×${Math.round(a.weight * 100)}%`,
    pct: Math.round(a.pct),
    tone: toneFor(a.pct),
    detail: `${Math.round(a.pct)} → ${Math.round(a.points)}`,
  }))

// Submit result shown as a fluid modal over the Workspace (replaces the old /result page).
export default function ResultModal({ open, onOpenChange, problemId }) {
  const navigate = useNavigate()
  const { data: problem } = useProblem(problemId)
  const submit = useSessionStore((s) => s.submitResult)

  if (!submit) return null

  // Fall back to the demo scorecard when the grader returns no cases.
  const graded = submit.total > 0
  const r = {
    ...RESULT,
    title: problem?.title ?? RESULT.title,
    ...(graded
      ? {
          score: submit.score,
          hiddenPass: submit.passed,
          hiddenTotal: submit.total,
          turns: submit.turns,
          tokens: fmtTokens(submit.tokens),
          hiddenCases: Array.from({ length: submit.total }, (_, i) => i < submit.passed),
          criteria: submit.axes?.length ? axesToCriteria(submit.axes) : RESULT.criteria,
          preset: '문제별 가중치 구성',
        }
      : null),
  }
  const failCount = graded ? r.hiddenTotal - r.hiddenPass : null

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.modalOverlay} />
        <Dialog.Content className={styles.modalContent} aria-describedby={undefined}>
          <Dialog.Close className={styles.modalClose} aria-label="닫기">
            <Close size={18} />
          </Dialog.Close>

          <div className={styles.modalBody}>
            {!graded && (
              <div className={styles.notice}>
                ⓘ 채점 그레이더가 점수를 산출하지 못해 데모 점수표를 표시합니다.
                {submit?.feedback ? ` (서버 응답: ${submit.feedback})` : ''}
              </div>
            )}

            {/* score header */}
            <div className={styles.scoreHeader}>
              <div className={styles.ring}>
                <div className={`mono ${styles.ringNum}`}>{r.score}</div>
                <div className={styles.ringDen}>/ {r.max}</div>
              </div>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div className={styles.passLabel}>통과</div>
                <Dialog.Title asChild>
                  <div className={styles.title}>{r.title}</div>
                </Dialog.Title>
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
                {graded ? (
                  failCount === 0 ? (
                    '히든 테스트를 전부 통과했습니다. 상세 입력은 비공개.'
                  ) : (
                    <>
                      히든 <span className="mono">{failCount}</span>개 케이스에서 실패 — 경계
                      조건을 점검하세요. 상세 입력은 비공개.
                    </>
                  )
                ) : (
                  <>
                    실패 케이스 <span className="mono">{r.failedCases.join(', ')}</span> — 음수
                    누적과 경계 인덱스에서 갈림. 상세 입력은 비공개.
                  </>
                )}
              </div>
            </Section>

            {/* coaching */}
            <Section title="축별 비교 & 코칭">
              {graded ? (
                <div className={styles.coaching}>
                  <b style={{ color: 'var(--text-h)' }}>채점 요약</b>
                  <br />
                  {r.feedback ?? submit.feedback}
                </div>
              ) : (
                <>
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
                  </div>
                </>
              )}
            </Section>
          </div>

          {/* footer */}
          <div className={styles.footer}>
            <button
              className="btn btn--ghost btn--block btn--lg"
              onClick={() => onOpenChange(false)}
            >
              계속 풀기
            </button>
            <button
              className="btn btn--primary btn--block btn--lg"
              onClick={() => navigate(`/leaderboard/${problemId}`)}
            >
              리더보드 보기 →
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
