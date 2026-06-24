import { NavLink } from 'react-router-dom'
import styles from './Navbar.module.css'

export default function Navbar() {
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
        <div className={styles.avatar}>K</div>
      </div>
    </nav>
  )
}
