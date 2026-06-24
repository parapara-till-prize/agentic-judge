import { useEffect, useRef, useState } from 'react'
import * as RSelect from '@radix-ui/react-select'
import { ChevronDown } from '@carbon/icons-react'
import styles from '../styles/components/Select.module.css'

// Styled single-select built on Radix Select.
// options: [{ value, label }]
// Controlled `open` + an outside-pointerdown fallback so it reliably closes when clicking
// away (Radix's own dismiss layer can miss this under some setups).
export default function Select({ value, onValueChange, options, ariaLabel }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const contentRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (triggerRef.current?.contains(e.target)) return
      if (contentRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open])

  return (
    <RSelect.Root
      open={open}
      onOpenChange={setOpen}
      value={value}
      onValueChange={onValueChange}
    >
      <RSelect.Trigger ref={triggerRef} className={styles.trigger} aria-label={ariaLabel}>
        <RSelect.Value />
        <RSelect.Icon className={styles.icon}>
          <ChevronDown size={14} />
        </RSelect.Icon>
      </RSelect.Trigger>

      <RSelect.Portal>
        <RSelect.Content
          ref={contentRef}
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
