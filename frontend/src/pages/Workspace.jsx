import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Badge } from '../components/ui'
import Markdown from '../components/Markdown'
import { useProblem, useStartAttempt, usePostMessage, useSubmit, useMe } from '../api/queries'
import { useSessionStore } from '../store/sessionStore'
import { useUiStore } from '../store/uiStore'
import styles from './Workspace.module.css'

const TOOL_CLASS = {
  write: styles.ttWrite,
  read: styles.ttRead,
  run: styles.ttRun,
}

const fmtTokens = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n ?? 0))

export default function Workspace() {
  const { id } = useParams()
  const navigate = useNavigate()

  const { data: problem } = useProblem(id)
  const { data: me, isLoading: meLoading } = useMe()
  const openLogin = useUiStore((s) => s.openLogin)
  const {
    attemptId, problemId, statement, files, messages, turns, tokens,
    startSession, pushUserMessage, applyAgentResult, setSubmitResult,
  } = useSessionStore()

  const startMut = useStartAttempt()
  const postMut = usePostMessage(attemptId)
  const submitMut = useSubmit(attemptId)

  const [draft, setDraft] = useState('')
  const [selectedPath, setSelectedPath] = useState(null)
  const chatEndRef = useRef(null)
  const startedRef = useRef(null)

  // start (or resume) the attempt session for this problem — requires a session user
  useEffect(() => {
    if (!me) return // anonymous: wait until logged in (backend /attempts is 401 otherwise)
    if (startedRef.current === id) return
    if (problemId === id && attemptId) {
      startedRef.current = id
      return
    }
    startedRef.current = id
    startMut.mutate(
      { problemId: id },
      {
        onSuccess: (d) =>
          startSession({
            attemptId: d.attempt_id,
            problemId: id,
            statement: d.statement,
            files: d.files,
          }),
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, me])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, postMut.isPending])

  // elapsed timer
  const [startedAt] = useState(Date.now())
  const [elapsed, setElapsed] = useState('00:00')
  useEffect(() => {
    const t = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000)
      const mm = String(Math.floor(s / 60)).padStart(2, '0')
      const ss = String(s % 60).padStart(2, '0')
      setElapsed(`${mm}:${ss}`)
    }, 1000)
    return () => clearInterval(t)
  }, [startedAt])

  // which file the read-only viewer shows
  const activePath = useMemo(() => {
    if (selectedPath && files.some((f) => f.path === selectedPath)) return selectedPath
    return (files.find((f) => f.path.includes('solution')) ?? files[0])?.path ?? null
  }, [selectedPath, files])
  const activeFile = files.find((f) => f.path === activePath)

  function send() {
    const text = draft.trim()
    if (!text || !attemptId || postMut.isPending) return
    setDraft('')
    pushUserMessage(text)
    postMut.mutate(text, { onSuccess: (d) => applyAgentResult(d) })
  }

  function submit() {
    if (!attemptId || submitMut.isPending) return
    submitMut.mutate(undefined, {
      onSuccess: (d) => {
        setSubmitResult(d)
        navigate(`/result/${id}`)
      },
    })
  }

  const authed = Boolean(me)
  const starting = authed && (startMut.isPending || (!attemptId && !startMut.isError))
  const title = problem?.title ?? '문제'

  return (
    <div className={styles.ws}>
      {/* TOP BAR */}
      <div className={styles.top}>
        <div className={styles.topLeft}>
          <button
            className={styles.backBtn}
            onClick={() => navigate(`/problem/${id}`)}
            aria-label="뒤로"
          >
            ←
          </button>
          <span className={`mono ${styles.metaId}`}>#{id}</span>
          <span className={styles.metaTitle}>{title}</span>
          {problem && <Badge difficulty={problem.difficulty} />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className={styles.meter}>
            <Meter label="턴" value={turns} />
            <div className={styles.meterSep} />
            <Meter label="토큰" value={fmtTokens(tokens)} />
            <div className={styles.meterSep} />
            <Meter label="경과" value={elapsed} />
          </div>
          <button
            className="btn btn--primary"
            style={{ padding: '10px 24px', fontWeight: 700 }}
            disabled={!attemptId || submitMut.isPending}
            onClick={submit}
          >
            {submitMut.isPending ? '채점 중…' : '제출'}
          </button>
        </div>
      </div>

      {/* 3 PANES */}
      <div className={styles.panes}>
        {/* LEFT: problem */}
        <div className={styles.pane}>
          <div className={styles.scroll}>
            <div className={styles.accSection}>
              <div className={styles.accHead} style={{ cursor: 'default' }}>
                문제 설명
              </div>
              <div className={styles.accBody}>
                {statement ? (
                  <Markdown source={statement} />
                ) : (
                  <span style={{ color: 'var(--text-dim)' }}>불러오는 중…</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* CENTER: agent chat */}
        <div className={styles.pane}>
          <div className={styles.paneHead}>
            <span className={styles.dot} />
            <span className={styles.agentName}>에이전트</span>
            <span className={`mono ${styles.agentMeta}`}>junior-dev</span>
            <span className={styles.agentMeta} style={{ marginLeft: 'auto' }}>
              컨텍스트 보존됨
            </span>
          </div>

          <div className={styles.scroll}>
            <div className={styles.chat}>
              {!authed && !meLoading && (
                <div className={styles.sysNote}>
                  이 워크스페이스를 시작하려면 로그인이 필요합니다.{' '}
                  <button
                    className="btn btn--primary"
                    style={{ marginTop: 10 }}
                    onClick={openLogin}
                  >
                    로그인
                  </button>
                </div>
              )}
              {starting && (
                <div className={styles.sysNote}>워크스페이스를 준비하는 중…</div>
              )}
              {startMut.isError && (
                <div className={styles.sysNote}>
                  세션 시작 실패: {startMut.error?.message}
                </div>
              )}
              {!starting && messages.length === 0 && (
                <div className={styles.sysNote}>
                  에이전트에게 첫 지시를 내려보세요. (예: “solution.py를 구현해줘”)
                </div>
              )}
              {messages.map((m, i) => (
                <Message key={i} msg={m} />
              ))}
              {postMut.isPending && <TypingBubble />}
              {postMut.isError && (
                <div className={styles.sysNote}>전송 실패: {postMut.error?.message}</div>
              )}
              <div ref={chatEndRef} />
            </div>
          </div>

          {/* input */}
          <div className={styles.chatInput}>
            <div className={styles.chatBox}>
              <textarea
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={!attemptId}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send()
                  }
                }}
                placeholder="에이전트에게 지시… (코드 직접 작성 불가)"
              />
              <div className={styles.chatBar}>
                <div className={styles.chatMini}>
                  <button className={styles.miniTag}>@파일 첨부</button>
                  <button className={styles.miniTag}>/되돌리기</button>
                </div>
                <button
                  className="btn btn--dark"
                  onClick={send}
                  disabled={!attemptId || postMut.isPending}
                >
                  전송 ↵
                </button>
              </div>
            </div>
            <div className={styles.chatLock}>
              🔒 코드 편집은 잠겨 있습니다. 변경은 오직 에이전트를 통해서만.
            </div>
          </div>
        </div>

        {/* RIGHT: files + code + tests */}
        <div className={styles.pane}>
          <div className={styles.paneHead} style={{ justifyContent: 'space-between' }}>
            <span>파일</span>
            <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>🔒 읽기 전용</span>
          </div>
          <div className={styles.filetree}>
            <div>📁 /workspace</div>
            {files.map((f) => (
              <div
                key={f.path}
                className={f.path === activePath ? styles.ftActive : styles.ftItem}
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedPath(f.path)}
              >
                📄 {f.path}
              </div>
            ))}
            {files.length === 0 && <div className={styles.ftItem}>— 비어 있음 —</div>}
          </div>

          {/* code viewer */}
          <div className={styles.codeview}>
            <div className={styles.codeBar}>
              <span>{activePath ?? '—'}</span>
              <span style={{ color: 'var(--text-dim)' }}>🔒</span>
            </div>
            <pre>
              {(activeFile?.content ?? '').split('\n').map((line, i) => (
                <div key={i}>
                  <span className="tok-ln">{String(i + 1).padStart(2, ' ')}</span>
                  {'  '}
                  <span>{line}</span>
                </div>
              ))}
            </pre>
          </div>

          {/* tests */}
          <div className={styles.tests}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-h)' }}>
                  예제 테스트
                </span>
                <span className={styles.tagPub}>공개</span>
              </div>
              <div className={styles.testRow} style={{ color: 'var(--text-dim)' }}>
                에이전트가 <span className="mono">run_command</span>로 직접 실행합니다.
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-h)' }}>
                  히든 테스트
                </span>
                <span className={styles.tagHidden}>가려짐</span>
              </div>
              <div className={styles.hiddenBox}>
                <div style={{ fontSize: 18, color: 'var(--text-faint)' }}>🔒</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
                  제출 후 공개됩니다
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Meter({ label, value }) {
  return (
    <div className={styles.meterItem}>
      <div className={styles.meterLabel}>{label}</div>
      <div className={`mono ${styles.meterValue}`}>{value}</div>
    </div>
  )
}

function Message({ msg }) {
  if (msg.role === 'user') {
    return (
      <div className={`${styles.msg} ${styles.msgUser}`}>
        <div className={styles.bubble}>{msg.text}</div>
      </div>
    )
  }
  return (
    <div className={`${styles.msg} ${styles.msgAgent}`}>
      {msg.text && <div className={styles.bubble}>{msg.text}</div>}
      {msg.tools?.length > 0 && (
        <div className={styles.toolTags}>
          {msg.tools.map((t, i) => (
            <span key={i} className={`${styles.toolTag} ${TOOL_CLASS[t.kind]}`}>
              {t.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function TypingBubble() {
  return (
    <div className={`${styles.msg} ${styles.msgAgent}`}>
      <div className={styles.typing}>
        <Dot c="var(--text-dim)" />
        <Dot c="var(--text-faint)" />
        <Dot c="var(--border)" />
      </div>
    </div>
  )
}

function Dot({ c }) {
  return (
    <span
      style={{ width: 6, height: 6, borderRadius: '50%', background: c, display: 'inline-block' }}
    />
  )
}
