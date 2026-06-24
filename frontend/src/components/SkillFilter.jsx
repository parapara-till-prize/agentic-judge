import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import styles from '../styles/components/SkillFilter.module.css'

// Multi-select skill filter built on Radix DropdownMenu checkbox items.
export default function SkillFilter({ skills, selected, onToggle, onClear }) {
  const count = selected.length
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={`filter-pill ${styles.trigger}${count ? ' active' : ''}`}
      >
        스킬{count ? ` · ${count}` : ''} ▾
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.menu} sideOffset={6} align="start">
          <div className={styles.label}>스킬로 필터</div>
          {skills.map((s) => (
            <DropdownMenu.CheckboxItem
              key={s}
              className={styles.item}
              checked={selected.includes(s)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => onToggle(s)}
            >
              <span className={styles.check}>
                <DropdownMenu.ItemIndicator>✓</DropdownMenu.ItemIndicator>
              </span>
              {s}
            </DropdownMenu.CheckboxItem>
          ))}
          {count > 0 && (
            <>
              <DropdownMenu.Separator className={styles.sep} />
              <DropdownMenu.Item
                className={`${styles.item} ${styles.reset}`}
                onSelect={onClear}
              >
                선택 해제
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
