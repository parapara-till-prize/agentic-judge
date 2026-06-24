import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { Close } from '@carbon/icons-react'
import { useProblem, useFeedback } from '../api/queries'
import { useSessionStore } from '../store/sessionStore'
import styles from '../styles/pages/Result.module.css'

const MAX_SCORE = 1000

const fmtTokens = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n ?? 0))

const AXIS_NOTE = {
    accuracy: '히든 통과',
    turn_efficiency: '턴 수',
    token_efficiency: '토큰 수',
    efficiency: '턴·토큰',
}

const toneFor = (pct) => (pct >= 75 ? 'ok' : pct >= 50 ? 'warn' : 'danger')

// score (0–1000) -> ring fill color; same thresholds as the bar tones.
const scoreColor = (frac) =>
    frac >= 0.75 ? 'var(--accent)' : frac >= 0.5 ? 'var(--warn)' : 'var(--danger)'

// Collapse the two efficiency axes (turn + token) into a single "효율성" row. Their points
// already sum into the score, so the merged row keeps the same total: weight/points add up
// and pct is their weight-weighted average (== points / (10 * weight)).
const mergeEfficiencyAxes = (axes) => {
    const eff = axes.filter((a) => a.key === 'turn_efficiency' || a.key === 'token_efficiency')
    if (eff.length < 2) return axes
    const rest = axes.filter((a) => a.key !== 'turn_efficiency' && a.key !== 'token_efficiency')
    const weight = eff.reduce((s, a) => s + a.weight, 0)
    const points = eff.reduce((s, a) => s + a.points, 0)
    const pct = weight > 0 ? points / (10 * weight) : 0
    return [...rest, { key: 'efficiency', label: '효율성', weight, pct, points }]
}

const axesToCriteria = (axes) =>
    axes.map((a) => ({
        key: a.key,
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
    const attemptId = useSessionStore((s) => s.attemptId)
    const fbMut = useFeedback(attemptId)

    // Auto-request AI feedback whenever the modal opens for a submit result. Re-fires on a
    // re-submit (new `submit` object) or a reopen. fbMut is intentionally not a dep (it's a
    // fresh object each render — including it would loop).
    useEffect(() => {
        if (!open || !submit || !attemptId) return
        fbMut.reset()
        fbMut.mutate(submit.failed ?? [])
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, submit, attemptId])

    if (!submit) return null

    const { passed, total, score, turns, tokens, axes = [] } = submit
    // passed/total are the weighted score (drives the ring + accuracy %); *_cases are the raw
    // test counts shown to the user. Fall back to the weighted pair for pre-weighting rows.
    const passedCases = submit.passed_cases ?? passed
    const totalCases = submit.total_cases ?? total
    const title = problem?.title ?? '제출 결과'
    const criteria = axesToCriteria(mergeEfficiencyAxes(axes))
    const accuracyCrit = criteria.find((c) => c.key === 'accuracy')
    const effCrits = criteria.filter((c) => c.key !== 'accuracy')
    const failCount = totalCases - passedCases
    // accuracy is the gate: efficiency counts toward the score ONLY when every hidden test
    // passes (matches scoring.evaluate's fully_passed). Any miss -> backend zeroes efficiency.
    const gated = !(total > 0 && passed === total)
    const verdict =
        total > 0 && passed === total ? '통과' : passed > 0 ? '부분 통과' : '미통과'
    // verdict badge tone matches the progress-bar colors: 통과→green, 부분 통과→amber, 미통과→red.
    const verdictTone =
        total > 0 && passed === total ? 'ok' : passed > 0 ? 'warn' : 'danger'
    // ring fills proportional to the score, colored by the same thresholds as the bars.
    const scoreFrac = Math.max(0, Math.min(1, MAX_SCORE ? score / MAX_SCORE : 0))
    const ringFill = scoreColor(scoreFrac)

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
                            <div
                                className={styles.ring}
                                style={{
                                    background: `conic-gradient(${ringFill} ${scoreFrac * 360}deg, var(--border-faint) 0deg)`,
                                }}
                            >
                                <div className={styles.ringInner}>
                                    <div className={`mono ${styles.ringNum}`} style={{ color: ringFill }}>
                                        {score}
                                    </div>
                                    <div className={styles.ringDen}>/ {MAX_SCORE}</div>
                                </div>
                            </div>
                            <div style={{ flex: 1, minWidth: 240 }}>
                                <span className={`${styles.passLabel} ${styles[verdictTone]}`}>
                                    {verdict}
                                </span>
                                <Dialog.Title asChild>
                                    <div className={styles.title}>{title}</div>
                                </Dialog.Title>
                                <div className={styles.headStats}>
                                    <Stat label="히든 통과" value={`${passedCases} / ${totalCases}`} />
                                    <Stat label="사용 턴" value={turns} />
                                    <Stat label="사용 토큰" value={fmtTokens(tokens)} />
                                </div>
                            </div>
                        </div>

                        {/* accuracy = the gate. always shown (even with 0 hidden cases). */}
                        {accuracyCrit && (
                            <Section
                                title="정확도"
                                subtitle="점수 핵심 지표"
                                aside={
                                    <span className="mono" style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>
                                        {passedCases} 통과 ·{' '}
                                        <span style={{ color: 'var(--danger)' }}>{failCount} 실패</span>
                                    </span>
                                }
                            >
                                <BarRow c={accuracyCrit} />
                                <div className={styles.hiddenNote} style={{ marginTop: 12 }}>
                                    {totalCases === 0 ? (
                                        '채점할 히든 테스트가 없어요. 상세 입력은 비공개예요.'
                                    ) : failCount === 0 ? (
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

                        {/* efficiency — only counts toward the score when all hidden tests pass */}
                        {effCrits.length > 0 && (
                            <Section
                                title="효율성"
                                subtitle={gated ? undefined : effCrits.map((c) => c.note).join(' · ')}
                                aside={gated ? <span className={styles.naTag}>미적용</span> : null}
                            >
                                {gated ? (
                                    <div className={styles.gateNote}>
                                        효율성은 히든 테스트를 <strong>전부 통과</strong>해야 점수에 반영돼요.{' '}
                                        {totalCases === 0
                                            ? '채점할 히든 테스트가 없어 이번엔 적용되지 않았어요.'
                                            : '아직 통과하지 못한 케이스가 있어 이번 제출에서는 채점되지 않았어요.'}
                                    </div>
                                ) : (
                                    <div className={styles.criteria}>
                                        {effCrits.map((c) => (
                                            <BarRow key={c.label} c={c} />
                                        ))}
                                    </div>
                                )}
                            </Section>
                        )}

                        {/* AI 채점 피드백 — 모달이 열리면 자동 요청, 응답까지 로딩 표시 */}
                        <Section
                            title="AI 채점 피드백"
                            subtitle="전반 평가 + 실패한 테스트별 힌트"
                            aside={
                                !fbMut.isPending && (fbMut.isError || fbMut.data) ? (
                                    <button
                                        className={styles.retryBtn}
                                        onClick={() => {
                                            fbMut.reset()
                                            fbMut.mutate(submit.failed ?? [])
                                        }}
                                    >
                                        ↻ 다시 받기
                                    </button>
                                ) : null
                            }
                        >
                            {fbMut.isPending ? (
                                <div className={styles.fbLoading}>
                                    <span className={styles.spinner} aria-hidden />
                                    AI가 코드를 분석하고 있어요…
                                </div>
                            ) : fbMut.isError ? (
                                <div className={styles.coachingEmpty}>
                                    피드백을 불러오지 못했어요. {fbMut.error?.message}
                                </div>
                            ) : fbMut.data ? (
                                <div className={styles.fb}>
                                    {fbMut.data.overall && (
                                        <div className={styles.fbOverall}>{fbMut.data.overall}</div>
                                    )}
                                    {fbMut.data.feedbacks?.length > 0 ? (
                                        <div className={styles.fbList}>
                                            {fbMut.data.feedbacks.map((f, i) => (
                                                <div key={i} className={styles.fbItem}>
                                                    <div className={styles.fbHint}>{f.hint}</div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className={styles.hiddenNote}>
                                            실패한 히든 테스트가 없어 세부 힌트는 없어요.
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className={styles.coachingEmpty}>곧 제공돼요.</div>
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

// labelless bar: the section title already names the axis, so a row is just bar + score.
function BarRow({ c }) {
    return (
        <div className={styles.barRow}>
            <div className={`${styles.bar} ${styles[c.tone]}`}>
                <span style={{ width: `${c.pct}%` }} />
            </div>
            <div className={`mono ${styles.critDetail}`}>{c.detail}</div>
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

function Section({ title, subtitle, aside, children }) {
    return (
        <div className={styles.section}>
            <div className={styles.sectionHead}>
                <div>
                    <div className={styles.sectionTitle}>{title}</div>
                    {subtitle && <div className={styles.sectionSub}>{subtitle}</div>}
                </div>
                {aside}
            </div>
            {children}
        </div>
    )
}
