import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { useGenerateProblem, usePublishProblem } from '../api/queries'
import styles from '../styles/pages/ProblemCreate.module.css'

const STEPS = ['기본 정보', '스토리 & 의도', 'AI 생성', '확인 & 등록']

const DIFFICULTY_OPTIONS = [
  { value: 'basic', label: '초급' },
  { value: 'mid', label: '중급' },
  { value: 'hard', label: '고급' },
]

const SKILL_SUGGESTIONS = ['배열', '문자열', '정규식', '재귀', '해시맵', '스택', '큐', '정렬', '이분탐색', '그래프', 'SQL', 'JOIN', 'GROUP BY']

export default function ProblemCreate() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)

  // form state
  const [form, setForm] = useState({
    title: '',
    type: 'algorithm',
    difficulty: 'basic',
    skills: [],
    story: '',
    intent: '',
  })
  const [skillInput, setSkillInput] = useState('')

  // generation result
  const [generated, setGenerated] = useState(null)   // {validated_token, statement_md, test_visible_py, hidden_cases, slug}
  const [editedStatement, setEditedStatement] = useState('')

  const generate = useGenerateProblem()
  const publish = usePublishProblem()

  // ----- field helpers -----
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  function addSkill(s) {
    const trimmed = s.trim()
    if (trimmed && !form.skills.includes(trimmed)) {
      setForm((f) => ({ ...f, skills: [...f.skills, trimmed] }))
    }
    setSkillInput('')
  }

  function removeSkill(s) {
    setForm((f) => ({ ...f, skills: f.skills.filter((x) => x !== s) }))
  }

  function handleSkillKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addSkill(skillInput)
    }
  }

  // ----- step navigation -----
  function next() { setStep((s) => Math.min(s + 1, 3)) }
  function prev() { setStep((s) => Math.max(s - 1, 0)) }

  function step1Valid() { return form.title.trim() }
  function step2Valid() { return form.story.trim().length >= 20 && form.intent.trim().length >= 10 }

  // ----- generate -----
  async function handleGenerate() {
    const res = await generate.mutateAsync({
      title: form.title,
      type: form.type,
      difficulty: form.difficulty,
      skills: form.skills,
      story: form.story,
      intent: form.intent,
    })
    if (!res.ok) return  // error shown via mutation state
    setGenerated(res)
    setEditedStatement(res.statement_md)
    next()
  }

  // ----- publish -----
  async function handlePublish() {
    await publish.mutateAsync({
      validated_token: generated.validated_token,
      statement_md: editedStatement !== generated.statement_md ? editedStatement : undefined,
    })
    navigate(`/problem/${generated.slug}`)
  }

  // ----- generation error message -----
  function renderGenError() {
    const data = generate.data
    if (!data || data.ok) return null
    return (
      <div className={styles.genError}>
        <p className={styles.genErrorTitle}>모범답안 검증 실패</p>
        {!data.visible_ok && (
          <details>
            <summary>test_visible.py 실패 출력</summary>
            <pre className={styles.pre}>{data.visible_output}</pre>
          </details>
        )}
        {!data.hidden_ok && (
          <details>
            <summary>test_hidden.py 실패 출력</summary>
            <pre className={styles.pre}>{data.hidden_output}</pre>
          </details>
        )}
        <p>Gemini를 다시 호출하거나 스토리·의도를 수정해보세요.</p>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <Navbar />

      <div className={styles.container}>
        {/* stepper */}
        <div className={styles.stepper}>
          {STEPS.map((label, i) => (
            <div
              key={i}
              className={`${styles.stepItem} ${i === step ? styles.active : ''} ${i < step ? styles.done : ''}`}
            >
              <div className={styles.stepNum}>{i < step ? '✓' : i + 1}</div>
              <span className={styles.stepLabel}>{label}</span>
              {i < STEPS.length - 1 && <div className={styles.stepLine} />}
            </div>
          ))}
        </div>

        {/* ── Step 0: 기본 정보 ── */}
        {step === 0 && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>기본 정보</h2>

            <label className={styles.label}>
              제목
              <input
                className={styles.input}
                value={form.title}
                onChange={set('title')}
                placeholder="예: 로그 파서 확장"
              />
            </label>

            <label className={styles.label}>
              유형
              <select className={styles.select} value={form.type} onChange={set('type')}>
                <option value="algorithm">알고리즘</option>
              </select>
            </label>

            <label className={styles.label}>
              난이도
              <div className={styles.radioGroup}>
                {DIFFICULTY_OPTIONS.map((opt) => (
                  <label key={opt.value} className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="difficulty"
                      value={opt.value}
                      checked={form.difficulty === opt.value}
                      onChange={set('difficulty')}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </label>

            <label className={styles.label}>
              스킬 태그
              <div className={styles.skillInput}>
                <input
                  className={styles.input}
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={handleSkillKeyDown}
                  placeholder="입력 후 Enter (예: 정규식)"
                />
                <button className={styles.addBtn} type="button" onClick={() => addSkill(skillInput)}>추가</button>
              </div>
              <div className={styles.skillChips}>
                {SKILL_SUGGESTIONS.filter((s) => !form.skills.includes(s)).map((s) => (
                  <button key={s} type="button" className={styles.suggestion} onClick={() => addSkill(s)}>{s}</button>
                ))}
              </div>
              {form.skills.length > 0 && (
                <div className={styles.skillChips}>
                  {form.skills.map((s) => (
                    <span key={s} className={styles.chip}>
                      {s}
                      <button type="button" onClick={() => removeSkill(s)}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </label>

            <div className={styles.actions}>
              <button className={styles.primary} disabled={!step1Valid()} onClick={next}>다음</button>
            </div>
          </div>
        )}

        {/* ── Step 1: 스토리 & 출제의도 ── */}
        {step === 1 && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>스토리 & 출제 의도</h2>

            <label className={styles.label}>
              문제 스토리
              <span className={styles.hint}>Gemini가 statement.md를 이 스토리 기반으로 작성합니다. 2~4문장 정도면 충분합니다.</span>
              <textarea
                className={styles.textarea}
                rows={4}
                value={form.story}
                onChange={set('story')}
                placeholder="예: 서버 로그 포맷이 바뀌어서 타임스탬프가 추가됐다. 기존 parse() 함수를 새 포맷에 맞게 수정해야 한다."
              />
              <span className={styles.charCount}>{form.story.length}자</span>
            </label>

            <label className={styles.label}>
              출제 의도 <span className={styles.secret}>(비공개 — 에이전트에게 숨겨짐)</span>
              <span className={styles.hint}>어떤 실수·트랩을 테스트하는지 적어주세요. hidden test 생성에만 쓰입니다.</span>
              <textarea
                className={styles.textarea}
                rows={3}
                value={form.intent}
                onChange={set('intent')}
                placeholder="예: parse()를 수정한 후 호출하는 다른 파일들도 같이 업데이트해야 한다는 점을 놓치면 실패"
              />
            </label>

            <div className={styles.actions}>
              <button className={styles.secondary} onClick={prev}>이전</button>
              <button
                className={styles.primary}
                disabled={!step2Valid() || generate.isPending}
                onClick={handleGenerate}
              >
                {generate.isPending ? 'AI 생성 중...' : 'AI로 생성하기'}
              </button>
            </div>

            {generate.isError && (
              <div className={styles.genError}>{generate.error?.message}</div>
            )}
            {renderGenError()}
          </div>
        )}

        {/* ── Step 2: 생성 결과 미리보기 + statement 편집 ── */}
        {step === 2 && generated && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>생성 결과 확인</h2>

            <div className={styles.section}>
              <div className={styles.sectionHead}>
                <span>statement.md</span>
                <span className={styles.editTag}>편집 가능</span>
              </div>
              <textarea
                className={`${styles.textarea} ${styles.codeArea}`}
                rows={20}
                value={editedStatement}
                onChange={(e) => setEditedStatement(e.target.value)}
              />
            </div>

            <div className={styles.section}>
              <div className={styles.sectionHead}>
                <span>test_visible.py</span>
                <span className={styles.readonlyTag}>읽기 전용</span>
              </div>
              <pre className={styles.pre}>{generated.test_visible_py}</pre>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionHead}>
                <span>hidden_cases ({generated.hidden_cases?.length || 0}개)</span>
                <span className={styles.hiddenTag}>비공개</span>
              </div>
              <div className={styles.caseList}>
                {(generated.hidden_cases || []).map((c) => (
                  <div key={c.id} className={styles.caseRow}>
                    <code>{c.id}</code>
                    <span className={styles.weight}>weight: {c.weight}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.actions}>
              <button className={styles.secondary} onClick={prev}>돌아가서 재생성</button>
              <button className={styles.primary} onClick={next}>다음</button>
            </div>
          </div>
        )}

        {/* ── Step 3: 최종 확인 & 등록 ── */}
        {step === 3 && generated && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>등록 확인</h2>

            <div className={styles.summary}>
              <div className={styles.summaryRow}><span>제목</span><strong>{form.title}</strong></div>
              <div className={styles.summaryRow}><span>유형</span><strong>{form.type}</strong></div>
              <div className={styles.summaryRow}>
                <span>난이도</span>
                <strong>{DIFFICULTY_OPTIONS.find((d) => d.value === form.difficulty)?.label}</strong>
              </div>
              <div className={styles.summaryRow}>
                <span>스킬</span>
                <strong>{form.skills.join(', ') || '없음'}</strong>
              </div>
              <div className={styles.summaryRow}>
                <span>히든 테스트</span>
                <strong>{generated.hidden_cases?.length || 0}개</strong>
              </div>
              <div className={styles.summaryRow}>
                <span>토큰 만료</span>
                <strong>10분 이내 등록 필요</strong>
              </div>
            </div>

            <div className={styles.actions}>
              <button className={styles.secondary} onClick={prev}>이전</button>
              <button
                className={styles.primary}
                disabled={publish.isPending}
                onClick={handlePublish}
              >
                {publish.isPending ? '등록 중...' : '문제 등록'}
              </button>
            </div>

            {publish.isError && (
              <div className={styles.genError}>{publish.error?.message}</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
