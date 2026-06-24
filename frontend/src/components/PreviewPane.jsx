import { useEffect, useMemo, useState } from 'react'
import { Renew, View, Terminal } from '@carbon/icons-react'
import styles from '../styles/pages/Workspace.module.css'

// Console-capture shim injected into the sandboxed iframe. It mirrors console.* and
// runtime errors back to the parent via postMessage so the "콘솔" tab can show them —
// the iframe runs with `allow-scripts` only (no same-origin), so postMessage is the
// one channel out.
const CONSOLE_SHIM = `<script>
(function () {
  function ser(a) {
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a); } catch (e) { return String(a); }
  }
  function send(level, args) {
    parent.postMessage({ __preview: true, level: level,
      text: [].map.call(args, ser).join(' ') }, '*');
  }
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (l) {
    var orig = console[l] ? console[l].bind(console) : function () {};
    console[l] = function () { send(l === 'debug' ? 'log' : l, arguments); orig.apply(null, arguments); };
  });
  window.addEventListener('error', function (e) {
    send('error', [e.message + (e.filename ? ' (' + e.filename + ':' + e.lineno + ')' : '')]);
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason; send('error', ['Unhandled rejection: ' + ((r && r.message) || r)]);
  });
})();
</script>`

// Assemble a single self-contained HTML document from the workspace files: find the html
// entry point, inline locally-referenced <link>/<script> (CDN/absolute URLs pass through),
// and inject the console shim. Returns null when there's no html file to render.
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

  // inject the shim as early as possible so it captures logs from the page's own scripts
  if (/<head\b[^>]*>/i.test(html)) html = html.replace(/<head\b[^>]*>/i, (m) => m + CONSOLE_SHIM)
  else if (/<html\b[^>]*>/i.test(html)) html = html.replace(/<html\b[^>]*>/i, (m) => m + CONSOLE_SHIM)
  else html = CONSOLE_SHIM + html
  return html
}

const LEVEL_CLASS = { error: styles.cnErr, warn: styles.cnWarn }

// Live render of the workspace's frontend output: an isolated iframe preview plus a
// console tab fed by the in-iframe shim. Re-renders whenever the files change; the
// console clears on each fresh render so it reflects only the current run.
export default function PreviewPane({ files, height }) {
  const [tab, setTab] = useState('preview')
  const [logs, setLogs] = useState([])
  const [nonce, setNonce] = useState(0) // bump to force a manual re-render
  const srcDoc = useMemo(() => buildSrcDoc(files), [files])

  // listen for the iframe's mirrored console/error messages
  useEffect(() => {
    const onMsg = (e) => {
      const d = e.data
      if (d && d.__preview) setLogs((prev) => [...prev, { level: d.level, text: d.text }])
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  // a new render (file change or manual refresh) starts with a clean console
  useEffect(() => {
    setLogs([])
  }, [srcDoc, nonce])

  const errCount = logs.filter((l) => l.level === 'error').length

  return (
    <div className={styles.preview} style={{ height }}>
      <div className={styles.previewBar}>
        <div className={styles.previewTabs}>
          <button
            className={tab === 'preview' ? styles.pvTabOn : styles.pvTab}
            onClick={() => setTab('preview')}
          >
            <View size={13} /> 미리보기
          </button>
          <button
            className={tab === 'console' ? styles.pvTabOn : styles.pvTab}
            onClick={() => setTab('console')}
          >
            <Terminal size={13} /> 콘솔
            {logs.length > 0 && (
              <span className={errCount ? styles.cnBadgeErr : styles.cnBadge}>{logs.length}</span>
            )}
          </button>
        </div>
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
        {tab === 'preview' ? (
          srcDoc ? (
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
          )
        ) : (
          <div className={styles.console}>
            {logs.length === 0 ? (
              <div className={styles.consoleEmpty}>콘솔 출력이 없어요.</div>
            ) : (
              logs.map((l, i) => (
                <div key={i} className={`${styles.cnLine} ${LEVEL_CLASS[l.level] ?? ''}`}>
                  {l.text}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
