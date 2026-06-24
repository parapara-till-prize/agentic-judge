import * as RSelect from '@radix-ui/react-select'
import styles from './Select.module.css'

// Styled single-select built on Radix Select.
// options: [{ value, label }]
export default function Select({ value, onValueChange, options, ariaLabel }) {
  return (
    <RSelect.Root value={value} onValueChange={onValueChange}>
      <RSelect.Trigger className={styles.trigger} aria-label={ariaLabel}>
        <RSelect.Value />
        <RSelect.Icon className={styles.icon}>▾</RSelect.Icon>
      </RSelect.Trigger>

      <RSelect.Portal>
        <RSelect.Content
          className={styles.content}
          position="popper"
          sideOffset={6}
        >
          <RSelect.Viewport className={styles.viewport}>
            {options.map((opt) => (
              <RSelect.Item
                key={opt.value}
                value={opt.value}
                className={styles.item}
              >
                <RSelect.ItemText>{opt.label}</RSelect.ItemText>
                <RSelect.ItemIndicator className={styles.indicator}>
                  ✓
                </RSelect.ItemIndicator>
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  )
}
