import { useNavigate } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { Close } from '@carbon/icons-react'
import { useProblem } from '../api/queries'
import { useSessionStore } from '../store/sessionStore'
import styles from '../pages/Result.module.css'

const MAX_SCORE = 1000

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

  const { passed, total, score, turns, tokens, axes = [], feedback } = submit
  const title = problem?.title ?? '제출 결과'
  const criteria = axesToCriteria(axes)
  const hiddenCases = Array.from({ length: total }, (_, i) => i < passed)
  const failCount = total - passed

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.modalOverlay} />
        <Dialog.Content className={styles.modalContent} aria-describedby={undefined}>
          <Dialog.Close className={styles.modalClose} aria-label="닫기">
            <Close size={18} />
          </Dialog.Close>

          <div className={styles.modalBody}>
            {/* score header */}
            <div className={styles.scoreHeader}>
              <div className={styles.ring}>
                <div className={`mono ${styles.ringNum}`}>{score}</div>
                <div className={styles.ringDen}>/ {MAX_SCORE}</div>
              </div>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div className={styles.passLabel}>통과</div>
                <Dialog.Title asChild>
                  <div className={styles.title}>{title}</div>
                </Dialog.Title>
                <div className={styles.headStats}>
                  <Stat label="히든 통과" value={`${passed} / ${total}`} />
                  <Stat label="사용 턴" value={turns} />
                  <Stat label="토큰" value={fmtTokens(tokens)} />
                </div>
              </div>
            </div>

            {/* modular scorecard */}
            {criteria.length > 0 && (
              <Section
                title={
                  <>
                    점수 구성{' '}
                    <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-dim)' }}>
                      · 가중치는 도메인/문제별 구성 (확정 전)
                    </span>
                  </>
                }
                aside={<span className={styles.presetTag}>문제별 가중치 구성</span>}
              >
                <div className={styles.criteria}>
                  {criteria.map((c) => (
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
            )}

            {/* hidden test grid */}
            {total > 0 && (
              <Section
                title="히든 테스트 현황"
                aside={
                  <span className="mono" style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>
                    {passed} 통과 ·{' '}
                    <span style={{ color: 'var(--danger)' }}>{failCount} 실패</span>
                  </span>
                }
              >
                <div className={styles.hiddenGrid}>
                  {hiddenCases.map((pass, i) => (
                    <div
                      key={i}
                      className={`${styles.hcell} ${pass ? styles.hPass : styles.hFail}`}
                    >
                      {pass ? '✓' : '✕'}
                    </div>
                  ))}
                </div>
                <div className={styles.hiddenNote}>
                  {failCount === 0 ? (
                    '히든 테스트를 전부 통과했어요. 상세 입력은 비공개예요.'
                  ) : (
                    <>
                      히든 <span className="mono">{failCount}</span>개 케이스에서 실패했어요 — 경계
                      조건을 점검해 보세요. 상세 입력은 비공개예요.
                    </>
                  )}
                </div>
              </Section>
            )}

            {/* grading summary */}
            {feedback && (
              <Section title="채점 요약">
                <div className={styles.coaching}>{feedback}</div>
              </Section>
            )}
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
