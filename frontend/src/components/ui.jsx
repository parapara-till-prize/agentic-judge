import { DOMAINS, DIFFICULTY } from '../data/constants'
import styles from './ui.module.css'

export function Badge({ difficulty }) {
  const d = DIFFICULTY[difficulty]
  if (!d) return null
  return <span className={`${styles.badge} ${styles[d.cls]}`}>{d.label}</span>
}

export function DomainTag({ domain }) {
  const d = DOMAINS[domain]
  if (!d) return null
  return (
    <span className={styles.domain} style={{ background: d.bg, color: d.fg }}>
      {d.label}
    </span>
  )
}

export function Chip({ children }) {
  return <span className={styles.chip}>{children}</span>
}

export function StatusDot({ solved }) {
  return solved ? (
    <span className={`${styles.statusDot} ${styles.done}`}>✓</span>
  ) : (
    <span className={`${styles.statusDot} ${styles.todo}`} />
  )
}
