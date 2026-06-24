// Minimal markdown renderer for problem statements (no dependency).
// Handles fenced code blocks, headings, unordered lists, blockquotes,
// and inline `code` / **bold**. Good enough for our statement.md files.
import styles from './Markdown.module.css'

function inline(text, keyBase) {
  // split on `code` and **bold**, keep delimiters
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    const key = `${keyBase}-${i}`
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={key} className="mono" style={{ color: 'var(--accent)' }}>
          {part.slice(1, -1)}
        </code>
      )
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <b key={key}>{part.slice(2, -2)}</b>
    }
    return part
  })
}

export default function Markdown({ source = '' }) {
  const blocks = source.split(/```/g)
  return (
    <div className={styles.md}>
      {blocks.map((block, bi) => {
        // odd blocks are fenced code
        if (bi % 2 === 1) {
          const body = block.replace(/^[\w-]*\n/, '') // drop language hint line
          return (
            <pre key={bi} className="mono code-block">
              {body.replace(/\n$/, '')}
            </pre>
          )
        }
        return renderProse(block, bi)
      })}
    </div>
  )
}

function renderProse(text, bi) {
  const lines = text.split('\n')
  const out = []
  let list = null

  const flushList = () => {
    if (list) {
      out.push(
        <ul key={`ul-${bi}-${out.length}`} className={styles.ul}>
          {list.map((item, i) => (
            <li key={i}>{inline(item, `li-${bi}-${i}`)}</li>
          ))}
        </ul>,
      )
      list = null
    }
  }

  lines.forEach((raw, i) => {
    const line = raw.trimEnd()
    const key = `${bi}-${i}`
    if (/^\s*[-*]\s+/.test(line)) {
      list = list ?? []
      list.push(line.replace(/^\s*[-*]\s+/, ''))
      return
    }
    flushList()
    if (!line.trim()) return
    if (line.startsWith('### ')) out.push(<h4 key={key}>{inline(line.slice(4), key)}</h4>)
    else if (line.startsWith('## ')) out.push(<h3 key={key}>{inline(line.slice(3), key)}</h3>)
    else if (line.startsWith('# ')) out.push(<h2 key={key}>{inline(line.slice(2), key)}</h2>)
    else if (line.startsWith('> '))
      out.push(
        <blockquote key={key} className={styles.quote}>
          {inline(line.slice(2), key)}
        </blockquote>,
      )
    else out.push(<p key={key}>{inline(line, key)}</p>)
  })
  flushList()
  return <div key={`prose-${bi}`}>{out}</div>
}
