import { useMemo, useState } from 'react'
import { Renew } from '@carbon/icons-react'
import styles from '../styles/pages/Workspace.module.css'

// Assemble a single self-contained HTML document from the workspace files: find the html
// entry point and inline locally-referenced <link>/<script> (CDN/absolute URLs pass
// through). Returns null when there's no html file to render.
function buildSrcDoc(files) {
  const byPath = new Map(files.map((f) => [f.path, f.content]))
  const htmlFile =
    files.find((f) => /(^|\/)index\.html$/.test(f.path)) ||
    files.find((f) => /\.html$/.test(f.path))
  if (!htmlFile) return null

  const dir = htmlFile.path.includes('/')
    ? htmlFile.path.slice(0, htmlFile.path.lastIndexOf('/') + 1)
    : ''
  // resolve a local href/src (relative to the html file) to its file content, or null
  // for anything external/unknown so it's left untouched.
  const resolve = (ref) => {
    if (/^(https?:)?\/\//i.test(ref) || ref.startsWith('data:')) return null
    const p = ref.replace(/^\.?\//, '')
    if (byPath.has(p)) return byPath.get(p)
    if (byPath.has(dir + p)) return byPath.get(dir + p)
    return null
  }

  let html = htmlFile.content
  html = html.replace(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi, (m, href) => {
    const css = resolve(href)
    return css != null ? `<style>\n${css}\n</style>` : m
  })
  html = html.replace(
    /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi,
    (m, src) => {
      const js = resolve(src)
      return js != null ? `<script>\n${js}\n</script>` : m
    },
  )
  return html
}

// Live render of the workspace's frontend output in an isolated iframe. Re-renders
// whenever the files change; the refresh button forces a manual re-render.
export default function PreviewPane({ files }) {
  const [nonce, setNonce] = useState(0) // bump to force a manual re-render
  const srcDoc = useMemo(() => buildSrcDoc(files), [files])

  return (
    <div className={styles.preview}>
      <div className={styles.previewBar}>
        <span className={styles.previewLabel}>실시간 렌더</span>
        <button
          className={styles.runBtn}
          onClick={() => setNonce((n) => n + 1)}
          disabled={!srcDoc}
          title="다시 렌더"
        >
          <Renew size={13} /> 새로고침
        </button>
      </div>

      <div className={styles.previewBody}>
        {srcDoc ? (
          <iframe
            key={nonce}
            className={styles.previewFrame}
            title="미리보기"
            srcDoc={srcDoc}
            sandbox="allow-scripts allow-modals allow-forms allow-popups"
          />
        ) : (
          <div className={styles.previewEmpty}>
            렌더할 <span className="mono">index.html</span>이 아직 없어요. 에이전트에게
            만들어 달라고 하면 여기에 실시간으로 표시돼요.
          </div>
        )}
      </div>
    </div>
  )
}
