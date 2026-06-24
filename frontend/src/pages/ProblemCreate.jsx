import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { useGenerateProblem, usePublishProblem } from '../api/queries'
import styles from '../styles/pages/ProblemCreate.module.css'

const STEPS = ['기본 정보', '스토리 & 의도', '생성 결과', '확인 & 등록']

const TYPE_OPTIONS = [
  { value: 'algorithm', label: '알고리즘' },
  { value: 'sql',       label: 'SQL 쿼리' },
  { value: 'frontend',  label: '프론트엔드' },
]

const DIFFICULTY_OPTIONS = [
  { value: 'basic', label: '초급' },
  { value: 'mid',   label: '중급' },
  { value: 'hard',  label: '고급' },
]

const SKILL_SUGGESTIONS = {
  algorithm: ['배열', '문자열', '정규식', '재귀', '해시맵', '스택', '큐', '정렬', '이분탐색', '그래프'],
  sql:       ['SELECT', 'GROUP BY', 'JOIN', 'WHERE', '서브쿼리', 'HAVING', 'ORDER BY', 'DISTINCT', 'NULL 처리'],
  frontend:  ['HTML', 'CSS', 'JavaScript', 'Flexbox', 'Grid', '반응형', 'DOM 조작', '이벤트 핸들링', 'position', '접근성'],
}

const STORY_PLACEHOLDER = {
  algorithm: '예: 서버 로그 포맷이 바뀌어서 타임스탬프가 추가됐다. 기존 parse() 함수를 새 포맷에 맞게 수정해야 한다.',
  sql:       '예: 회사 HR 시스템에서 각 부서의 활성 직원 평균 급여를 조회해야 한다. 퇴직자는 제외해야 한다.',
  frontend:  '예: 쇼핑몰 상품 목록 페이지에 스크롤해도 상단에 고정되는 네비게이션 바를 구현해야 한다.',
}

const INTENT_PLACEHOLDER = {
  algorithm: '예: parse()를 수정한 후 호출하는 다른 파일들도 같이 업데이트해야 한다는 것을 놓치면 실패',
  sql:       '예: WHERE active=1 없이 GROUP BY만 쓰면 퇴직자 포함 평균이 나와서 실패. 퇴직자만 있는 부서는 결과에서 제외해야 함.',
  frontend:  '예: position:sticky 대신 fixed를 쓰면 레이아웃이 깨지고, 모바일 뷰포트에서 햄버거 메뉴 없으면 실패',
}

export default function ProblemCreate() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)

  const [form, setForm] = useState({
    title: '',
    type: 'algorithm',
    difficulty: 'basic',
    skills: [],
    story: '',
    intent: '',
  })
  const [skillInput, setSkillInput] = useState('')
  const [generated, setGenerated] = useState(null)
  const [editedStatement, setEditedStatement] = useState('')

  const generate = useGenerateProblem()
  const publish = usePublishProblem()

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  function changeType(e) {
    setForm((f) => ({ ...f, type: e.target.value, skills: [] }))
  }

  function addSkill(s) {
    const v = s.trim()
    if (v && !form.skills.includes(v)) setForm((f) => ({ ...f, skills: [...f.skills, v] }))
    setSkillInput('')
  }

  function removeSkill(s) {
    setForm((f) => ({ ...f, skills: f.skills.filter((x) => x !== s) }))
  }

  function handleSkillKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addSkill(skillInput) }
  }

  const next = () => setStep((s) => Math.min(s + 1, 3))
  const prev = () => setStep((s) => Math.max(s - 1, 0))

  async function handleGenerate() {
    const res = await generate.mutateAsync({
      title: form.title,
      type: form.type,
      difficulty: form.difficulty,
      skills: form.skills,
      story: form.story,
      intent: form.intent,
    })
    if (!res.ok) return
    setGenerated(res)
    setEditedStatement(res.statement_md)
    next()
  }

  async function handlePublish() {
    const res = await publish.mutateAsync({
      validated_token: generated.validated_token,
      statement_md: editedStatement !== generated.statement_md ? editedStatement : undefined,
    })
    navigate(`/problem/${res.id}`)
  }

  const typeLabel = TYPE_OPTIONS.find((t) => t.value === form.type)?.label ?? ''
  const diffLabel = DIFFICULTY_OPTIONS.find((d) => d.value === form.difficulty)?.label ?? ''
  const suggestions = SKILL_SUGGESTIONS[form.type] ?? []

  return (
    <div className={styles.page}>
      <Navbar />

      {/* 생성 중 로딩 오버레이 */}
      {generate.isPending && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingBox}>
            <div className={styles.spinner} />
            <p className={styles.loadingTitle}>AI가 문제를 생성하고 있어요</p>
            <div className={styles.loadingSteps}>
              <div className={styles.loadingStep}>① Gemini로 문제 파일 생성 중...</div>
              <div className={styles.loadingStep}>② 모범답안으로 테스트 검증 중...</div>
              <div className={styles.loadingStep} style={{ color: 'var(--text-dim)', marginTop: 4 }}>
                약 15~30초 소요됩니다
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={styles.container}>
        {/* 스테퍼 */}
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

        {/* Step 0: 기본 정보 */}
        {step === 0 && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>기본 정보</h2>

            <label className={styles.label}>
              제목
              <input
                className={styles.input}
                value={form.title}
                onChange={setField('title')}
                placeholder="예: 로그 파서 확장"
              />
            </label>

            <label className={styles.label}>
              유형
              <select className={styles.select} value={form.type} onChange={changeType}>
                {TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
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
                      onChange={setField('difficulty')}
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
                  placeholder="입력 후 Enter"
                />
                <button className={styles.addBtn} type="button" onClick={() => addSkill(skillInput)}>
                  추가
                </button>
              </div>
              <div className={styles.skillChips}>
                {suggestions.filter((s) => !form.skills.includes(s)).map((s) => (
                  <button key={s} type="button" className={styles.suggestion} onClick={() => addSkill(s)}>
                    {s}
                  </button>
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
              <button className={styles.primary} disabled={!form.title.trim()} onClick={next}>
                다음
              </button>
            </div>
          </div>
        )}

        {/* Step 1: 스토리 & 출제의도 */}
        {step === 1 && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>스토리 & 출제 의도</h2>

            <label className={styles.label}>
              문제 스토리
              <span className={styles.hint}>
                Gemini가 이 스토리를 바탕으로 statement.md를 작성합니다. 2~4문장이면 충분합니다.
              </span>
              <textarea
                className={styles.textarea}
                rows={4}
                value={form.story}
                onChange={setField('story')}
                placeholder={STORY_PLACEHOLDER[form.type]}
              />
              <span className={styles.charCount}>{form.story.length}자</span>
            </label>

            <label className={styles.label}>
              출제 의도
              <span className={styles.secret}>비공개 — 에이전트에게 숨겨짐</span>
              <span className={styles.hint}>
                어떤 실수나 트랩을 테스트하는지 적어주세요. hidden test 생성에만 사용됩니다.
              </span>
              <textarea
                className={styles.textarea}
                rows={3}
                value={form.intent}
                onChange={setField('intent')}
                placeholder={INTENT_PLACEHOLDER[form.type]}
              />
            </label>

            <div className={styles.actions}>
              <button className={styles.secondary} onClick={prev}>이전</button>
              <button
                className={styles.primary}
                disabled={form.story.trim().length < 10 || form.intent.trim().length < 5}
                onClick={handleGenerate}
              >
                AI로 생성하기
              </button>
            </div>

            {generate.isError && (
              <div className={styles.genError}>{generate.error?.message}</div>
            )}
            {generate.data && !generate.data.ok && (
              <div className={styles.genError}>
                <p className={styles.genErrorTitle}>모범답안 검증 실패 (자동 재시도 후에도 실패)</p>
                {!generate.data.visible_ok && (
                  <div className={styles.outputBlock}>
                    <p className={styles.outputLabel}>visible 테스트 출력</p>
                    <pre className={styles.pre}>
                      {generate.data.visible_output || '(출력 없음 — Docker 이미지 미빌드일 수 있음)'}
                    </pre>
                  </div>
                )}
                {!generate.data.hidden_ok && (
                  <div className={styles.outputBlock}>
                    <p className={styles.outputLabel}>hidden 채점 출력</p>
                    <pre className={styles.pre}>
                      {generate.data.hidden_output || '(출력 없음 — Docker 이미지 미빌드일 수 있음)'}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 2: 생성 결과 미리보기 + statement 편집 */}
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

            {(generated.preview_files ?? []).map((file) => (
              <div key={file.name} className={styles.section}>
                <div className={styles.sectionHead}>
                  <span>{file.name}</span>
                  <span className={styles.readonlyTag}>읽기 전용</span>
                </div>
                <pre className={styles.pre}>{file.content}</pre>
              </div>
            ))}

            <div className={styles.section}>
              <div className={styles.sectionHead}>
                <span>hidden_cases ({generated.hidden_cases?.length || 0}개)</span>
                <span className={styles.hiddenTag}>비공개</span>
              </div>
              <div className={styles.caseList}>
                {(generated.hidden_cases || []).map((c) => (
                  <div key={c.id} className={styles.caseRow}>
                    <code>{c.id}</code>
                    <span className={styles.weight}>weight {c.weight}</span>
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

        {/* Step 3: 최종 확인 & 등록 */}
        {step === 3 && generated && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>등록 확인</h2>

            <div className={styles.summary}>
              <div className={styles.summaryRow}>
                <span>제목</span><strong>{form.title}</strong>
              </div>
              <div className={styles.summaryRow}>
                <span>유형</span><strong>{typeLabel}</strong>
              </div>
              <div className={styles.summaryRow}>
                <span>난이도</span><strong>{diffLabel}</strong>
              </div>
              <div className={styles.summaryRow}>
                <span>스킬</span>
                <strong>{form.skills.join(', ') || '없음'}</strong>
              </div>
              <div className={styles.summaryRow}>
                <span>히든 테스트</span>
                <strong>{generated.hidden_cases?.length || 0}개</strong>
              </div>
            </div>

            <div className={styles.actions}>
              <button className={styles.secondary} onClick={prev}>이전</button>
              <button className={styles.primary} disabled={publish.isPending} onClick={handlePublish}>
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
