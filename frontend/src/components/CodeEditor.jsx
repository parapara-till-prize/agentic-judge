import { useEffect, useMemo, useRef, useState } from 'react'
import { Save, Locked, Edit } from '@carbon/icons-react'
import { highlight } from '../lib/highlight'
import styles from '../styles/components/CodeEditor.module.css'

// Syntax-highlighted view of one workspace file. Read-only by default — the user clicks
// "수정" to enter edit mode, where the transparent <textarea> over the highlighted <pre>
// becomes editable. The gutter mirrors line numbers; all three layers share font metrics +
// padding and scroll in sync, so caret / glyphs / line numbers stay aligned.
//
// `content` is the persisted file content (from the store). Local edits live in `value`;
// dirty = value !== content. Saving lifts `value` up via onSave; once the store snapshot
// comes back with the new content, dirty clears and we drop back to read-only.
//
// `locked` (agent busy) forces read-only regardless of edit mode.
export default function CodeEditor({ path, content, locked, saving, onSave }) {
  const [value, setValue] = useState(content ?? '')
  const [editing, setEditing] = useState(false)
  const preRef = useRef(null)
  const gutterRef = useRef(null)
  const wasSaving = useRef(false)

  // switching files: hard-reset content and drop out of edit mode
  useEffect(() => {
    setValue(content ?? '')
    setEditing(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])
  // upstream change to the same file (e.g. the agent rewrote it): only adopt it when the
  // user has no pending edits, so we never clobber unsaved work.
  useEffect(() => {
    setValue((v) => (v === content ? v : content ?? ''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content])

  const dirty = value !== (content ?? '')
  const readOnly = !editing || locked

  // a save round-trip just finished: if it stuck (no longer dirty), leave edit mode.
  useEffect(() => {
    if (wasSaving.current && !saving && !dirty) setEditing(false)
    wasSaving.current = saving
  }, [saving, dirty])
  const nodes = useMemo(() => highlight(value), [value])
  const lineNos = useMemo(
    () => value.split('\n').map((_, i) => i + 1).join('\n'),
    [value],
  )

  function syncScroll(e) {
    const { scrollTop, scrollLeft } = e.target
    if (preRef.current) {
      preRef.current.scrollTop = scrollTop
      preRef.current.scrollLeft = scrollLeft
    }
    if (gutterRef.current) gutterRef.current.scrollTop = scrollTop
  }

  function save() {
    if (dirty && !saving && !readOnly) onSave(value)
  }

  function cancel() {
    setValue(content ?? '')
    setEditing(false)
  }

  function onKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      save()
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = e.target
      const { selectionStart: s, selectionEnd: end } = ta
      setValue(value.slice(0, s) + '    ' + value.slice(end))
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = s + 4
      })
    }
  }

  return (
    <div className={styles.codeview}>
      <div className={styles.codeBar}>
        <span className={styles.path}>{path ?? '—'}</span>
        {locked ? (
          <span className={styles.lockNote}>
            <Locked size={13} /> 에이전트 작업 중
          </span>
        ) : !editing ? (
          <button
            className={styles.editBtn}
            disabled={!path}
            onClick={() => setEditing(true)}
            title="이 파일 수정"
          >
            <Edit size={13} /> 수정
          </button>
        ) : (
          <span className={styles.barActions}>
            <button className={styles.ghostBtn} onClick={cancel} disabled={saving}>
              취소
            </button>
            <button
              className={`${styles.saveBtn} ${dirty ? styles.dirty : ''}`}
              disabled={!dirty || saving}
              onClick={save}
              title="저장 (⌘S)"
            >
              {dirty && <span className={styles.dot} />}
              <Save size={13} />
              {saving ? '저장 중…' : '저장 ⌘S'}
            </button>
          </span>
        )}
      </div>

      <div className={styles.editor}>
        <div ref={gutterRef} className={styles.gutter}>{lineNos}</div>
        <div className={styles.codeArea}>
          <pre ref={preRef} className={styles.highlight} aria-hidden="true">
            {nodes}
          </pre>
          <textarea
            className={styles.input}
            value={value}
            readOnly={readOnly}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            wrap="off"
            placeholder={path ? '' : '파일을 선택하세요'}
            onChange={(e) => setValue(e.target.value)}
            onScroll={syncScroll}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>
    </div>
  )
}
