// Problem-statement renderer. react-markdown + remark-gfm handles GFM tables, links,
// ordered/nested lists, code fences, etc. Styling lives in Markdown.module.css (element
// selectors scoped under .md). Statements are author-trusted; no raw HTML is enabled.
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import styles from '../styles/components/Markdown.module.css'

// `assetBase` lets a statement reference per-problem images by bare filename
// (e.g. `![](preview-desktop.png)`); relative URLs are resolved against it, while
// absolute/scheme/anchor URLs fall through to react-markdown's default sanitizer.
export default function Markdown({ source = '', assetBase = '' }) {
  const urlTransform = (url) =>
    assetBase && url && !/^([a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(url)
      ? assetBase + url
      : defaultUrlTransform(url)

  return (
    <div className={styles.md}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={urlTransform}>
        {source}
      </ReactMarkdown>
    </div>
  )
}
