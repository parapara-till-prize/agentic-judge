import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Badge } from '../components/ui'
import {
  PROBLEMS,
  PROBLEM_DETAIL,
  TRANSCRIPT,
  CODE_LINES,
  PUBLIC_TESTS,
} from '../data/mock'
import styles from './Workspace.module.css'

const TOOL_CLASS = {
  write: styles.ttWrite,
  read: styles.ttRead,
  run: styles.ttRun,
}

export default function Workspace() {
  const { id } = useParams()
  const navigate = useNavigate()
  const problem = PROBLEMS.find((p) => String(p.id) === id) || PROBLEMS[0]

  const [messages, setMessages] = useState(TRANSCRIPT)
  const [draft, setDraft] = useState('')
  const [turns, setTurns] = useState(7)
  const chatEndRef = useRef(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function send() {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    setTurns((t) => t + 1)
    setMessages((m) => [
      ...m.filter((x) => !x.typing),
      { role: 'user', text },
      {
        role: 'agent',
        text: '지시를 반영해 코드를 수정하고 예제 테스트를 다시 실행했습니다.',
        tools: [
          { kind: 'write', label: '⊞ write_file · solution.py' },
          { kind: 'run', label: '▶ run_tests · 3 passed' },
        ],
      },
    ])
  }

  return (
    <div className={styles.ws}>
      {/* TOP BAR */}
      <div className={styles.top}>
        <div className={styles.topLeft}>
          <button
            className={styles.backBtn}
            onClick={() => navigate(`/problem/${problem.id}`)}
            aria-label="뒤로"
          >
            ←
          </button>
          <span className={`mono ${styles.metaId}`}>#{problem.id}</span>
          <span className={styles.metaTitle}>{problem.title}</span>
          <Badge difficulty={problem.difficulty} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className={styles.meter}>
            <Meter label="턴" value={turns} />
            <div className={styles.meterSep} />
            <Meter label="토큰" value="14.2k" />
            <div className={styles.meterSep} />
            <Meter label="경과" value="06:13" />
          </div>
          <button
            className="btn btn--primary"
            style={{ padding: '10px 24px', fontWeight: 700 }}
            onClick={() => navigate(`/result/${problem.id}`)}
          >
            제출
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
                길이 <span className="mono">N</span> 배열과 <span className="mono">M</span>개의
                질의 <span className="mono">(i,j)</span>. 각 질의의 구간 합을 출력한다.{' '}
                <span className="mono">N,M ≤ 10⁵</span>.
              </div>
            </div>
            <ProblemAccordion title="예제 입출력" defaultOpen>
              <div className="frame-label" style={{ marginBottom: 4 }}>
                입력
              </div>
              <pre className="mono code-block" style={{ marginBottom: 10 }}>
                {PROBLEM_DETAIL.sampleInput}
              </pre>
              <div className="frame-label" style={{ marginBottom: 4 }}>
                출력
              </div>
              <pre className="mono code-block">{PROBLEM_DETAIL.sampleOutput}</pre>
            </ProblemAccordion>
            <ProblemAccordion title="제약 조건">
              <ul className={styles.constraints}>
                {PROBLEM_DETAIL.constraints.map((c) => (
                  <li key={c}>
                    <span className="mono">{c}</span>
                  </li>
                ))}
              </ul>
            </ProblemAccordion>
          </div>
        </div>

        {/* CENTER: agent chat */}
        <div className={styles.pane}>
          <div className={styles.paneHead}>
            <span className={styles.dot} />
            <span className={styles.agentName}>에이전트</span>
            <span className={`mono ${styles.agentMeta}`}>junior-dev · claude-sonnet</span>
            <span className={styles.agentMeta} style={{ marginLeft: 'auto' }}>
              컨텍스트 보존됨
            </span>
          </div>

          <div className={styles.scroll}>
            <div className={styles.chat}>
              {messages.map((m, i) => (
                <Message key={i} msg={m} />
              ))}
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
                <button className="btn btn--dark" onClick={send}>
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
          {/* file tree */}
          <div className={styles.paneHead} style={{ justifyContent: 'space-between' }}>
            <span>파일</span>
            <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>🔒 읽기 전용</span>
          </div>
          <div className={styles.filetree}>
            <div>📁 /workspace</div>
            <div className={styles.ftActive}>📄 solution.py</div>
            <div className={styles.ftItem}>📄 input.txt</div>
            <div className={styles.ftItem}>📁 tests/</div>
          </div>

          {/* code viewer */}
          <div className={styles.codeview}>
            <div className={styles.codeBar}>
              <span>solution.py</span>
              <span style={{ color: 'var(--text-dim)' }}>🔒</span>
            </div>
            <pre>
              {CODE_LINES.map((line, i) => (
                <div key={i}>
                  <span className="tok-ln">{String(i + 1).padStart(2, ' ')}</span>
                  {'  '}
                  {line.map(([tok, txt], j) => (
                    <span key={j} className={tok ? `tok-${tok}` : undefined}>
                      {txt}
                    </span>
                  ))}
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
                <span
                  className="mono"
                  style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 'auto', fontWeight: 700 }}
                >
                  3 / 3
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {PUBLIC_TESTS.map((t) => (
                  <div className={styles.testRow} key={t.name}>
                    <span style={{ color: 'var(--accent)' }}>✓</span>
                    <span className="mono">{t.name}</span>
                    <span className="mono" style={{ marginLeft: 'auto', color: 'var(--text-dim)' }}>
                      {t.ms}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-h)' }}>
                  히든 테스트
                </span>
                <span className={styles.tagHidden}>가려짐</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 'auto' }}>
                  ?? / 20
                </span>
              </div>
              <div className={styles.hiddenBox}>
                <div style={{ fontSize: 18, color: 'var(--text-faint)' }}>🔒</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
                  제출 후 공개됩니다
                </div>
                <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 2 }}>
                  20 cases · hidden
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
      <div className={styles.bubble}>{msg.text}</div>
      {msg.tools && (
        <div className={styles.toolTags}>
          {msg.tools.map((t, i) => (
            <span key={i} className={`${styles.toolTag} ${TOOL_CLASS[t.kind]}`}>
              {t.label}
            </span>
          ))}
        </div>
      )}
      {msg.typing && (
        <div className={styles.typing}>
          <Dot c="var(--text-dim)" />
          <Dot c="var(--text-faint)" />
          <Dot c="var(--border)" />
        </div>
      )}
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

function ProblemAccordion({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={styles.accSection}>
      <div className={styles.accHead} onClick={() => setOpen((o) => !o)}>
        <span>{title}</span>
        <span className={styles.accCaret}>{open ? '▾ 접기' : '▸ 펼치기'}</span>
      </div>
      {open && <div style={{ marginTop: 12 }}>{children}</div>}
    </div>
  )
}
