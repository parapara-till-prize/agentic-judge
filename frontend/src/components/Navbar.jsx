import { NavLink } from 'react-router-dom'
import * as Dropdown from '@radix-ui/react-dropdown-menu'
import {
  Login as LoginIcon,
  Logout as LogoutIcon,
  UserAvatar,
  ChevronDown,
} from '@carbon/icons-react'
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
          <NavLink to="/problems">문제</NavLink>
          <NavLink to="/leaderboard/1024">리더보드</NavLink>
        </div>
      </div>
      <div className={styles.right}>
        {me ? (
          <Dropdown.Root>
            <Dropdown.Trigger className={styles.user} aria-label="사용자 메뉴">
              <div className={styles.avatar}>
                {me.username.charAt(0).toUpperCase()}
              </div>
              <span className={styles.name}>{me.username}</span>
              <ChevronDown size={14} className={styles.caret} />
            </Dropdown.Trigger>
            <Dropdown.Portal>
              <Dropdown.Content
                className={styles.menu}
                align="end"
                sideOffset={8}
              >
                <div className={styles.menuHead}>
                  <div className={styles.menuName}>{me.username}</div>
                  <div className={styles.menuMail}>로그인됨</div>
                </div>
                <Dropdown.Separator className={styles.menuSep} />
                <Dropdown.Item
                  className={styles.menuItem}
                  onSelect={(e) => e.preventDefault()}
                >
                  <UserAvatar size={16} />
                  마이페이지
                  <span className={styles.soonTag}>준비 중</span>
                </Dropdown.Item>
                <Dropdown.Separator className={styles.menuSep} />
                <Dropdown.Item
                  className={`${styles.menuItem} ${styles.menuDanger}`}
                  disabled={logout.isPending}
                  onSelect={() => logout.mutate()}
                >
                  <LogoutIcon size={16} />
                  로그아웃
                </Dropdown.Item>
              </Dropdown.Content>
            </Dropdown.Portal>
          </Dropdown.Root>
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
