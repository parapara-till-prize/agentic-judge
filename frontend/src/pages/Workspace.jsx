import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Folder, Document, CheckmarkFilled, ErrorFilled } from '@carbon/icons-react'
import { Badge } from '../components/ui'
import Markdown from '../components/Markdown'
import { useProblem, useStartAttempt, useSubmit, useMe } from '../api/queries'
import { streamMessage } from '../api/stream'
import { useSessionStore } from '../store/sessionStore'
import { useUiStore } from '../store/uiStore'
import ResultModal from '../components/ResultModal'
import ConfirmModal from '../components/ConfirmModal'
import styles from './Workspace.module.css'

const TOOL_CLASS = {
  write: styles.ttWrite,
  read: styles.ttRead,
  run: styles.ttRun,
}

const fmtTokens = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n ?? 0))

// fold the flat [{path}] list into a nested {dirs, files} tree for the right pane
function buildTree(files) {
  const root = {}
  for (const f of files) {
    const parts = f.path.split('/')
    let node = root
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1
      node[part] = node[part] || (isFile ? { __file: f.path } : {})
      if (!isFile) node = node[part]
    })
  }
  return root
}

export default function Workspace() {
  const { id } = useParams()
  const navigate = useNavigate()

  const { data: problem } = useProblem(id)
  const { data: me, isLoading: meLoading } = useMe()
  const openLogin = useUiStore((s) => s.openLogin)
  const {
    attemptId, statement, files, messages, turns, tokens,
    testResult, agentBusy,
    startSession, resetSession, pushUserMessage, setSubmitResult,
    streamToolCall, streamAgentText, streamFiles, streamTestResult,
    finishTurn, endTurnError,
  } = useSessionStore()

  const startMut = useStartAttempt()
  const submitMut = useSubmit(attemptId)
  const authed = Boolean(me)

  const [draft, setDraft] = useState('')
  const [sendError, setSendError] = useState(null)
  const [selectedPath, setSelectedPath] = useState(null)
  const [resultOpen, setResultOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const chatEndRef = useRef(null)

  // resizable panes: left/right widths in px, center fills the rest (1fr)
  const panesRef = useRef(null)
  const [leftW, setLeftW] = useState(340)
  const [rightW, setRightW] = useState(420)

  // start a drag on either splitter; clamps so the center pane keeps >=320px
  function startResize(side, e) {
    e.preventDefault()
    const startX = e.clientX
    const startLeft = leftW
    const startRight = rightW
    const total = panesRef.current?.getBoundingClientRect().width ?? 1200
    const onMove = (ev) => {
      const dx = ev.clientX - startX
      if (side === 'left') {
        const max = total - startRight - 320
        setLeftW(Math.max(240, Math.min(max, startLeft + dx)))
      } else {
        const max = total - startLeft - 320
        setRightW(Math.max(280, Math.min(max, startRight - dx)))
      }
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Start a fresh attempt on entering a problem (or once auth becomes available).
  // StrictMode-safe: dev double-invokes this effect on mount, and React Query drops the
  // per-`mutate` onSuccess of the throwaway first mount — so we guard with an `ignore`
  // flag and let the live mount's result win instead of relying on a ref (which would pin
  // the single fire to the discarded mount and leave us stuck on "준비 중"). Depending on
  // the boolean `authed` (not the `me` object) avoids re-firing on background refetch.
  useEffect(() => {
    if (!authed) return // anonymous: backend /attempts is 401; wait for login
    let ignore = false
    resetSession() // drop any prior session so the UI doesn't flash stale transcript/files
    startMut.mutate(
      { problemId: id },
      {
        onSuccess: (d) => {
          if (ignore) return
          startSession({
            attemptId: d.attempt_id,
            problemId: id,
            statement: d.statement,
            files: d.files,
          })
        },
        onError: (e) => {
          if (ignore) return
          toast.error('워크스페이스를 시작하지 못했습니다', { description: e.message })
        },
      },
    )
    return () => {
      ignore = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, authed])

  // hard gate: the workspace is auth-only. Once /auth/me resolves to anonymous, bounce back
  // to the problem detail and pop the login modal so the page never renders for guests.
  useEffect(() => {
    if (meLoading || me) return
    toast.info('계속하려면 로그인이 필요합니다', { id: 'auth-required' })
    openLogin()
    navigate(`/problem/${id}`, { replace: true })
  }, [me, meLoading, id, openLogin, navigate])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, agentBusy])

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
  const fileTree = useMemo(() => buildTree(files), [files])

  async function send() {
    const text = draft.trim()
    if (!text || !attemptId || agentBusy) return
    setDraft('')
    setSendError(null)
    pushUserMessage(text)
    try {
      await streamMessage(attemptId, text, {
        onEvent: (ev) => {
          switch (ev.type) {
            case 'agent':
              streamAgentText(ev)
              break
            case 'tool_call':
              streamToolCall(ev)
              break
            case 'tool_result':
              if (ev.name === 'run_command') streamTestResult(ev)
              break
            case 'file_written':
              setSelectedPath(ev.path) // jump the viewer to the file just edited
              break
            case 'files':
              streamFiles(ev.files)
              break
            case 'done':
              finishTurn(ev)
              break
            default:
              break
          }
        },
      })
    } catch (e) {
      endTurnError()
      setSendError(e.message)
      toast.error('메시지를 전송하지 못했습니다', { description: e.message })
    }
  }

  // leaving discards the in-progress attempt (re-entry starts fresh), so confirm first —
  // but only once there's actual progress worth losing.
  function requestLeave() {
    if (messages.length > 0) setLeaveOpen(true)
    else navigate(`/problem/${id}`)
  }

  function submit() {
    if (!attemptId || submitMut.isPending) return
    submitMut.mutate(undefined, {
      onSuccess: (d) => {
        setSubmitResult(d)
        setResultOpen(true)
        if (d.total > 0) {
          toast.success('성공적으로 제출했습니다', {
            description: `채점 결과 ${d.score}점 · 히든 테스트 ${d.passed}/${d.total} 통과`,
          })
        }
      },
      onError: (e) => toast.error('제출하지 못했습니다', { description: e.message }),
    })
  }

  const starting = authed && (startMut.isPending || (!attemptId && !startMut.isError))
  const title = problem?.title ?? '문제'

  // don't render the workspace chrome for guests (or during the auth check) — the effect
  // above redirects anonymous users and opens the login modal.
  if (!me) return null

  return (
    <div className={styles.ws}>
      {/* TOP BAR */}
      <div className={styles.top}>
        <div className={styles.topLeft}>
          <button
            className={styles.backBtn}
            onClick={requestLeave}
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
      <div
        ref={panesRef}
        className={styles.panes}
        style={{ gridTemplateColumns: `${leftW}px 6px 1fr 6px ${rightW}px` }}
      >
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

        {/* resizer: left | center */}
        <div
          className={styles.resizer}
          onMouseDown={(e) => startResize('left', e)}
          role="separator"
          aria-orientation="vertical"
        />

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
              {starting && (
                <div className={styles.sysNote}>워크스페이스를 준비하는 중…</div>
              )}
              {startMut.isError && (
                <div className={styles.sysNote}>
                  세션 시작 실패: {startMut.error?.message}
                </div>
              )}
              {authed && !starting && messages.length === 0 && (
                <div className={styles.sysNote}>
                  에이전트에게 첫 지시를 내려보세요. (예: “solution.py를 구현해줘”)
                </div>
              )}
              {messages.map((m, i) => (
                <Message key={i} msg={m} />
              ))}
              {agentBusy && <TypingBubble />}
              {sendError && (
                <div className={styles.sysNote}>전송 실패: {sendError}</div>
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
                disabled={!attemptId || agentBusy}
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
                  disabled={!attemptId || agentBusy}
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

        {/* resizer: center | right */}
        <div
          className={styles.resizer}
          onMouseDown={(e) => startResize('right', e)}
          role="separator"
          aria-orientation="vertical"
        />

        {/* RIGHT: files + code + tests */}
        <div className={styles.pane}>
          <div className={styles.paneHead} style={{ justifyContent: 'space-between' }}>
            <span>파일</span>
            <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>🔒 읽기 전용</span>
          </div>
          <div className={styles.filetree}>
            <div className={styles.ftRoot}>
              <Folder size={14} /> workspace
            </div>
            <FileTree
              tree={fileTree}
              depth={1}
              activePath={activePath}
              onSelect={setSelectedPath}
            />
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
                {testResult?.ran && (
                  <span
                    className="mono"
                    style={{
                      marginLeft: 'auto',
                      fontSize: 11,
                      fontWeight: 700,
                      color: testResult.ok ? 'var(--accent)' : 'var(--danger)',
                    }}
                  >
                    {testResult.passed} / {testResult.total}
                  </span>
                )}
              </div>
              {testResult?.ran ? (
                <div className={styles.testResult}>
                  <div className={styles.testSummary}>
                    {testResult.ok ? (
                      <CheckmarkFilled size={16} style={{ color: 'var(--accent)' }} />
                    ) : (
                      <ErrorFilled size={16} style={{ color: 'var(--danger)' }} />
                    )}
                    <span>
                      {testResult.ok
                        ? `${testResult.passed}개 전부 통과`
                        : `${testResult.failed}개 실패 · ${testResult.passed}개 통과`}
                    </span>
                  </div>
                  <pre className={styles.testOutput}>{testResult.raw.trim()}</pre>
                </div>
              ) : (
                <div className={styles.testRow} style={{ color: 'var(--text-dim)' }}>
                  에이전트가 <span className="mono">run_command</span>로 예제 테스트를 실행하면
                  결과가 여기 실시간으로 표시됩니다.
                </div>
              )}
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

      <ResultModal open={resultOpen} onOpenChange={setResultOpen} problemId={id} />
      <ConfirmModal
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title="워크스페이스를 나갈까요?"
        message="나가면 지금 진행 중인 시도와 에이전트 대화가 사라집니다. 다시 들어오면 새 시도로 시작됩니다."
        confirmLabel="나가기"
        cancelLabel="계속 풀기"
        danger
        onConfirm={() => {
          navigate(`/problem/${id}`)
          toast.info('시도를 종료했습니다')
        }}
      />
    </div>
  )
}

// Recursive nested tree: folders (sorted first) then files, indented by depth.
function FileTree({ tree, depth, activePath, onSelect }) {
  const entries = Object.entries(tree).sort(([an, av], [bn, bv]) => {
    const aFile = Boolean(av.__file)
    const bFile = Boolean(bv.__file)
    if (aFile !== bFile) return aFile ? 1 : -1 // dirs first
    return an.localeCompare(bn)
  })
  return entries.map(([name, node]) => {
    const pad = { paddingLeft: 10 + depth * 14 }
    if (node.__file) {
      const active = node.__file === activePath
      return (
        <div
          key={node.__file}
          className={active ? styles.ftActive : styles.ftItem}
          style={{ ...pad, cursor: 'pointer' }}
          onClick={() => onSelect(node.__file)}
        >
          <Document size={14} /> {name}
        </div>
      )
    }
    return (
      <div key={name}>
        <div className={styles.ftDir} style={pad}>
          <Folder size={14} /> {name}
        </div>
        <FileTree tree={node} depth={depth + 1} activePath={activePath} onSelect={onSelect} />
      </div>
    )
  })
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
