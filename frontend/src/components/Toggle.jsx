import * as RToggle from '@radix-ui/react-toggle'
import styles from './Toggle.module.css'

// Styled on/off toggle built on Radix Toggle.
export default function Toggle({ pressed, onPressedChange, children }) {
  return (
    <RToggle.Root
      className={`filter-pill ${styles.toggle}`}
      pressed={pressed}
      onPressedChange={onPressedChange}
    >
      {children}
    </RToggle.Root>
  )
}
