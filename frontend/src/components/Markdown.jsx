// Problem-statement renderer. react-markdown + remark-gfm handles GFM tables, links,
// ordered/nested lists, code fences, etc. Styling lives in Markdown.module.css (element
// selectors scoped under .md). Statements are author-trusted; no raw HTML is enabled.
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import styles from './Markdown.module.css'

export default function Markdown({ source = '' }) {
  return (
    <div className={styles.md}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  )
}
