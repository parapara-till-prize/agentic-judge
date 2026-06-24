import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Close, Login as LoginIcon, UserFollow } from '@carbon/icons-react'
import { useLogin, useRegister } from '../api/queries'
import { useUiStore } from '../store/uiStore'
import styles from './LoginModal.module.css'

// Global auth modal. Identity = session cookie; on success the /auth/me query is primed
// by the mutation hooks, so the rest of the app reacts immediately.
export default function LoginModal() {
  const loginOpen = useUiStore((s) => s.loginOpen)
  const setLoginOpen = useUiStore((s) => s.setLoginOpen)
  const closeLogin = useUiStore((s) => s.closeLogin)

  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const loginMut = useLogin()
  const registerMut = useRegister()
  const mut = mode === 'login' ? loginMut : registerMut

  // reset fields/errors whenever the modal opens or the mode flips
  useEffect(() => {
    if (loginOpen) {
      setUsername('')
      setPassword('')
      loginMut.reset()
      registerMut.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginOpen, mode])

  function submit(e) {
    e.preventDefault()
    const u = username.trim()
    if (!u || !password || mut.isPending) return
    mut.mutate(
      { username: u, password },
      { onSuccess: () => closeLogin() },
    )
  }

  return (
    <Dialog.Root open={loginOpen} onOpenChange={setLoginOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content} aria-describedby={undefined}>
          <div className={styles.head}>
            <Dialog.Title className={styles.title}>
              {mode === 'login' ? '로그인' : '회원가입'}
            </Dialog.Title>
            <Dialog.Close className={styles.close} aria-label="닫기">
              <Close size={18} />
            </Dialog.Close>
          </div>

          <div className={styles.tabs}>
            <button
              type="button"
              className={mode === 'login' ? styles.tabActive : styles.tab}
              onClick={() => setMode('login')}
            >
              로그인
            </button>
            <button
              type="button"
              className={mode === 'register' ? styles.tabActive : styles.tab}
              onClick={() => setMode('register')}
            >
              회원가입
            </button>
          </div>

          <form className={styles.form} onSubmit={submit}>
            <label className={styles.field}>
              <span>아이디</span>
              <input
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="username"
                autoComplete="username"
              />
            </label>
            <label className={styles.field}>
              <span>비밀번호</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </label>

            {mut.isError && (
              <div className={styles.error}>
                {mode === 'login'
                  ? '아이디 또는 비밀번호가 올바르지 않아요.'
                  : mut.error?.message || '회원가입에 실패했어요.'}
              </div>
            )}

            <button
              type="submit"
              className={`btn btn--primary ${styles.submit}`}
              disabled={!username.trim() || !password || mut.isPending}
            >
              {mode === 'login' ? <LoginIcon size={16} /> : <UserFollow size={16} />}
              {mut.isPending
                ? '처리 중…'
                : mode === 'login'
                  ? '로그인'
                  : '가입하고 시작'}
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
