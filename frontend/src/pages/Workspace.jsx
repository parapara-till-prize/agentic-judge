import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Folder, Document, CheckmarkFilled, ErrorFilled, Locked, Play, Code, View } from '@carbon/icons-react'
import { Badge } from '../components/ui'
import Markdown from '../components/Markdown'
import CodeEditor from '../components/CodeEditor'
import { useProblem, useStartAttempt, useSubmit, useSaveFile, useRunTests, useMe } from '../api/queries'
import { streamMessage } from '../api/stream'
import { useSessionStore } from '../store/sessionStore'
import { useUiStore } from '../store/uiStore'
import ResultModal from '../components/ResultModal'
import ConfirmModal from '../components/ConfirmModal'
import PreviewPane from '../components/PreviewPane'
import styles from '../styles/pages/Workspace.module.css'

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
  const saveMut = useSaveFile(attemptId)
  const runMut = useRunTests(attemptId)
  const authed = Boolean(me)

  const [draft, setDraft] = useState('')
  const [sendError, setSendError] = useState(null)
  const [selectedPath, setSelectedPath] = useState(null)
  const [centerTab, setCenterTab] = useState('code') // frontend: 코드 / 미리보기
  const [resultOpen, setResultOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const chatEndRef = useRef(null)

  // resizable panes: left/right widths in px, center fills the rest (1fr)
  const panesRef = useRef(null)
  const [leftW, setLeftW] = useState(340)
  const [rightW, setRightW] = useState(420)

  // right pane is a vertical stack: file tree / code viewer / tests. tree+tests get pixel
  // heights, the code viewer (flex:1) fills the middle.
  const rightPaneRef = useRef(null)
  const [treeH, setTreeH] = useState(150)
  const [testsH, setTestsH] = useState(240)

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

  // vertical splitters inside the right pane; clamp so the code viewer keeps room
  function startVResize(which, e) {
    e.preventDefault()
    const startY = e.clientY
    const startTree = treeH
    const startTests = testsH
    const total = rightPaneRef.current?.getBoundingClientRect().height ?? 800
    const reserve = 180 // pane head + handles + code-viewer minimum
    const onMove = (ev) => {
      const dy = ev.clientY - startY
      if (which === 'tree') {
        setTreeH(Math.max(60, Math.min(total - startTests - reserve, startTree + dy)))
      } else {
        setTestsH(Math.max(80, Math.min(total - startTree - reserve, startTests - dy)))
      }
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'row-resize'
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
          toast.error('워크스페이스를 시작하지 못했어요', { description: e.message })
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
    toast.info('계속하려면 로그인이 필요해요', { id: 'auth-required' })
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
      toast.error('메시지를 전송하지 못했어요', { description: e.message })
    }
  }

  // leaving discards the in-progress attempt (re-entry starts fresh), so confirm first —
  // but only once there's actual progress worth losing.
  function requestLeave() {
    if (messages.length > 0) setLeaveOpen(true)
    else navigate(`/problem/${id}`)
  }

  // direct edit -> persist to the attempt workdir, then adopt the fresh snapshot so the
  // viewer/tests reflect exactly what local runs + submit will grade.
  function saveActiveFile(content) {
    if (!attemptId || !activePath) return
    saveMut.mutate(
      { path: activePath, content },
      {
        onSuccess: (d) => {
          streamFiles(d.files)
          toast.success('파일을 저장했어요', { description: activePath })
        },
        onError: (e) => toast.error('저장하지 못했어요', { description: e.message }),
      },
    )
  }

  // manually run the visible example tests (same cmd the agent uses) — useful when the
  // agent skips running them, or to verify a direct edit. Feeds the same result panel.
  function runTests() {
    if (!attemptId || runMut.isPending || agentBusy) return
    runMut.mutate(undefined, {
      onSuccess: (d) => streamTestResult(d), // {command, output}
      onError: (e) => toast.error('테스트를 실행하지 못했어요', { description: e.message }),
    })
  }

  function submit() {
    if (!attemptId || submitMut.isPending) return
    submitMut.mutate(undefined, {
      onSuccess: (d) => {
        setSubmitResult(d)
        setResultOpen(true)
        if (d.total > 0) {
          toast.success('성공적으로 제출했어요', {
            description: `채점 결과 ${d.score}점 · 히든 테스트 ${d.passed}/${d.total} 통과`,
          })
        }
      },
      onError: (e) => toast.error('제출하지 못했어요', { description: e.message }),
    })
  }

  const starting = authed && (startMut.isPending || (!attemptId && !startMut.isError))
  const title = problem?.title ?? '문제'
  // frontend problems add a 미리보기 (live render) tab beside the code editor
  const isFrontend = problem?.domain === 'frontend'

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
            <span
              className={`${styles.dot} ${agentBusy ? styles.dotBusy : ''}`}
              title={agentBusy ? '작업 중' : '대기 중'}
            />
            <span className={styles.agentName}>에이전트</span>
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
                <Message key={i} msg={m} scrollRef={chatEndRef} />
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
                disabled={!attemptId}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send()
                  }
                }}
                placeholder="에이전트에게 지시…"
              />
              <button
                className="btn btn--dark"
                onClick={send}
                disabled={!attemptId || agentBusy}
              >
                전송 ↵
              </button>
            </div>
            <div className={styles.chatLock}>
              에이전트에게 지시하거나, 오른쪽에서 코드를 직접 편집해 저장할 수 있어요.
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
        <div className={styles.pane} ref={rightPaneRef}>
          <div className={styles.paneHead}>
            <span>파일</span>
          </div>
          <div className={styles.filetree} style={{ height: treeH }}>
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

          {/* resizer: file tree | code viewer */}
          <div
            className={styles.vresizer}
            onMouseDown={(e) => startVResize('tree', e)}
            role="separator"
            aria-orientation="horizontal"
          />

          {/* middle: code editor under a 코드 pill (kept across all domains for a consistent
              strip); frontend problems add a 미리보기 pill that swaps in the live render */}
          <div className={styles.centerStack}>
            <div className={styles.centerTabs}>
              <button
                className={centerTab === 'code' ? styles.pvTabOn : styles.pvTab}
                onClick={() => setCenterTab('code')}
              >
                <Code size={13} /> 코드
              </button>
              {isFrontend && (
                <button
                  className={centerTab === 'preview' ? styles.pvTabOn : styles.pvTab}
                  onClick={() => setCenterTab('preview')}
                >
                  <View size={13} /> 미리보기
                </button>
              )}
            </div>
            {isFrontend && centerTab === 'preview' ? (
              <PreviewPane files={files} />
            ) : (
              <>
                {/* direct edits land in the attempt workdir (the source of truth) */}
                <CodeEditor
                  key={activePath ?? '∅'}
                  path={activePath}
                  content={activeFile?.content ?? ''}
                  locked={agentBusy}
                  saving={saveMut.isPending}
                  onSave={saveActiveFile}
                />
                <div className={styles.codeHint}>
                  직접 편집해 저장하면 로컬 테스트·제출에 그대로 반영돼요.
                </div>
              </>
            )}
          </div>

          {/* resizer: code/preview | tests */}
          <div
            className={styles.vresizer}
            onMouseDown={(e) => startVResize('tests', e)}
            role="separator"
            aria-orientation="horizontal"
          />

          {/* example tests — shown for every problem, including frontend */}
          <div className={styles.tests} style={{ height: testsH }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-h)' }}>
                  예제 테스트
                </span>
                {testResult?.ran && (
                  <span
                    className="mono"
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: testResult.ok ? 'var(--accent)' : 'var(--danger)',
                    }}
                  >
                    {testResult.passed} / {testResult.total}
                  </span>
                )}
                <button
                  className={styles.runBtn}
                  style={{ marginLeft: 'auto' }}
                  onClick={runTests}
                  disabled={!attemptId || runMut.isPending || agentBusy}
                  title="예제 테스트 실행"
                >
                  <Play size={13} />
                  {runMut.isPending ? '실행 중…' : '실행'}
                </button>
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
                  결과가 여기 실시간으로 표시돼요.
                </div>
              )}
            </div>

            <div
              style={{
                borderTop: '1px solid var(--border-soft)',
                paddingTop: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12.5,
                color: 'var(--text-dim)',
              }}
            >
              <Locked size={14} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
              예제 테스트를 통과해도 정답이 보장되진 않아요. 제출은 가려진 테스트로 채점돼요.
            </div>
          </div>
        </div>
      </div>

      <ResultModal open={resultOpen} onOpenChange={setResultOpen} problemId={id} />
      <ConfirmModal
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title="워크스페이스를 나갈까요?"
        message="나가면 지금 진행 중인 시도와 에이전트 대화가 사라져요. 다시 들어오면 새 시도로 시작돼요."
        confirmLabel="나가기"
        cancelLabel="계속 풀기"
        danger
        onConfirm={() => {
          navigate(`/problem/${id}`)
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

function Message({ msg, scrollRef }) {
  if (msg.role === 'user') {
    return (
      <div className={`${styles.msg} ${styles.msgUser}`}>
        <div className={styles.bubble}>{msg.text}</div>
      </div>
    )
  }
  return (
    <div className={`${styles.msg} ${styles.msgAgent}`}>
      {msg.text && <AgentText text={msg.text} scrollRef={scrollRef} />}
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

// Reveals the agent's text one chunk at a time so a completed message "types" in
// rather than popping in whole. Resumes from the current progress on every effect run
// (rather than locking after the first), so React StrictMode's double-invoke in dev
// doesn't make the whole message snap in at once.
function AgentText({ text, scrollRef }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!text) return
    let i = count
    if (i >= text.length) return // already fully revealed — nothing to animate
    // longer messages reveal several chars per tick so they finish in a bounded time
    const step = Math.max(1, Math.round(text.length / 200))
    const id = setInterval(() => {
      i = Math.min(text.length, i + step)
      setCount(i)
      scrollRef?.current?.scrollIntoView({ block: 'end' })
      if (i >= text.length) clearInterval(id)
    }, 16)
    return () => clearInterval(id)
    // count is intentionally read once at mount, not a dep — the interval drives it forward
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, scrollRef])
  return <div className={styles.bubble}>{text.slice(0, count)}</div>
}

function TypingBubble() {
  return (
    <div className={`${styles.msg} ${styles.msgAgent}`}>
      <div className={`${styles.bubble} ${styles.thinking}`}>생각하는 중…</div>
    </div>
  )
}
