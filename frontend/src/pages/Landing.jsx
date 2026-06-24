import { useNavigate } from 'react-router-dom'
import { ArrowRight, ChatBot, Review, CheckmarkOutline } from '@carbon/icons-react'
import Navbar from '../components/Navbar'
import styles from './Landing.module.css'

const STEPS = [
  {
    icon: ChatBot,
    title: '지시해요',
    body: '에이전트(주니어)에게 자연어로 요구사항을 전달해요. 코드는 한 줄도 직접 타이핑하지 않아요.',
  },
  {
    icon: Review,
    title: '리뷰해요',
    body: '에이전트가 파일을 읽고·쓰고·예제 테스트를 돌리는 과정을 보고, 부족하면 다시 지시해요.',
  },
  {
    icon: CheckmarkOutline,
    title: '제출해요',
    body: '숨겨진 히든 테스트로 채점해요. 통과 수·턴 수·토큰 효율로 점수가 매겨져요.',
  },
]

export default function Landing() {
  const navigate = useNavigate()

  return (
    <div className="app">
      <Navbar />
      <main className="page">
        <div className="card card--flush">
          {/* hero */}
          <div className={styles.hero}>
            <div className={styles.kicker}>AGENTIC&nbsp;CODING&nbsp;ARENA</div>
            <h1 className={styles.title}>AI를 부려서 코드를 짜요.</h1>
            <p className={styles.sub}>
              당신은 테크리드, AI는 주니어예요. 한 줄도 직접 타이핑하지 않고{' '}
              <b>자연어 지시</b>만으로 문제를 통과시켜 보세요. 평가받는 건 코딩 실력이 아니라{' '}
              <b>에이전트를 부리는 능력</b>이에요.
            </p>
            <div className={styles.ctaRow}>
              <button
                className="btn btn--primary btn--lg"
                onClick={() => navigate('/problems')}
              >
                문제 풀러 가기 <ArrowRight size={18} />
              </button>
              <button
                className="btn btn--ghost btn--lg"
                onClick={() => navigate('/leaderboard/1024')}
              >
                리더보드 보기
              </button>
            </div>
          </div>

          {/* how it works */}
          <div className={styles.steps}>
            {STEPS.map((s, i) => (
              <div key={s.title} className={styles.step}>
                <div className={styles.stepHead}>
                  <span className={styles.stepNum}>{i + 1}</span>
                  <s.icon size={20} className={styles.stepIcon} />
                </div>
                <div className={styles.stepTitle}>{s.title}</div>
                <p className={styles.stepBody}>{s.body}</p>
              </div>
            ))}
          </div>

          {/* rule footer */}
          <div className={styles.rule}>
            규칙 · 코드 직접 입력 불가 · 모든 변경은 에이전트를 통해서만.
          </div>
        </div>
      </main>
    </div>
  )
}
