import { NavLink } from 'react-router-dom'
import { Login as LoginIcon, Logout as LogoutIcon } from '@carbon/icons-react'
import { useMe, useLogout } from '../api/queries'
import { useUiStore } from '../store/uiStore'
import styles from './Navbar.module.css'

export default function Navbar() {
  const { data: me } = useMe()
  const logout = useLogout()
  const openLogin = useUiStore((s) => s.openLogin)

  return (
    <nav className={styles.nav}>
      <div className={styles.left}>
        <NavLink to="/" className={styles.logo}>
          agent<span>·</span>arena
        </NavLink>
        <div className={styles.links}>
          <NavLink to="/" end>
            문제
          </NavLink>
          <NavLink to="/leaderboard/1024">리더보드</NavLink>
          <a href="#guide" onClick={(e) => e.preventDefault()}>
            가이드
          </a>
        </div>
      </div>
      <div className={styles.right}>
        {me ? (
          <div className={styles.user}>
            <div className={styles.avatar}>
              {me.username.charAt(0).toUpperCase()}
            </div>
            <span className={styles.name}>{me.username}</span>
            <button
              className={styles.iconBtn}
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              aria-label="로그아웃"
              title="로그아웃"
            >
              <LogoutIcon size={16} />
            </button>
          </div>
        ) : (
          <button className={styles.loginBtn} onClick={openLogin}>
            <LoginIcon size={16} />
            로그인
          </button>
        )}
      </div>
    </nav>
  )
}
