import { useNavigate } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { Close } from '@carbon/icons-react'
import { useProblem } from '../api/queries'
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

    if (!submit) return null

    const { passed, total, score, turns, tokens, axes = [] } = submit
    const title = problem?.title ?? '제출 결과'
    const criteria = axesToCriteria(mergeEfficiencyAxes(axes))
    const accuracyCrit = criteria.find((c) => c.key === 'accuracy')
    const effCrits = criteria.filter((c) => c.key !== 'accuracy')
    const failCount = total - passed
    // accuracy is the gate: no test passed -> efficiency is moot (backend already zeroes it).
    const gated = total > 0 && passed === 0
    const verdict =
        total > 0 && passed === total ? '통과' : passed > 0 ? '부분 통과' : '미통과'
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
                                <div className={`${styles.passLabel} ${gated ? styles.passLabelFail : ''}`}>
                                    {verdict}
                                </div>
                                <Dialog.Title asChild>
                                    <div className={styles.title}>{title}</div>
                                </Dialog.Title>
                                <div className={styles.headStats}>
                                    <Stat label="히든 통과" value={`${passed} / ${total}`} />
                                    <Stat label="사용 턴" value={turns} />
                                    <Stat label="사용 토큰" value={fmtTokens(tokens)} />
                                </div>
                            </div>
                        </div>

                        {/* accuracy = the gate. always shown (even with 0 hidden cases). */}
                        {accuracyCrit && (
                            <Section
                                title="정확도"
                                subtitle="채점 게이트"
                                aside={
                                    <span className="mono" style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>
                                        {passed} 통과 ·{' '}
                                        <span style={{ color: 'var(--danger)' }}>{failCount} 실패</span>
                                    </span>
                                }
                            >
                                <BarRow c={accuracyCrit} />
                                <div className={styles.hiddenNote} style={{ marginTop: 12 }}>
                                    {total === 0 ? (
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

                        {/* efficiency — only meaningful when at least one test passed */}
                        {effCrits.length > 0 && (
                            <Section
                                title="효율성"
                                subtitle={gated ? undefined : effCrits.map((c) => c.note).join(' · ')}
                                aside={gated ? <span className={styles.naTag}>미적용</span> : null}
                            >
                                {gated ? (
                                    <div className={styles.gateNote}>
                                        정확도 0 · 통과한 테스트가 없어 효율성은 채점되지 않았어요. 효율성은 정답을
                                        맞힌 뒤에야 점수에 반영돼요.
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

                        {/* grading feedback — wired to the feedback API later; empty for now */}
                        <Section title="채점 피드백">
                            <div className={styles.coachingEmpty}>곧 제공돼요.</div>
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
