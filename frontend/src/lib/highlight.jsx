// Tiny, dependency-free syntax highlighter for the workspace code pane. Returns an array of
// React nodes (styled spans + plain strings) so we never inject HTML. Tuned for Python (the
// judge runtime) but the lexer is generic enough for JS-ish code too. Colors come from the
// existing .tok-* palette in styles/primitives.css.
const KEYWORDS = new Set([
  'def', 'return', 'if', 'elif', 'else', 'for', 'while', 'in', 'not', 'and', 'or',
  'import', 'from', 'as', 'class', 'try', 'except', 'finally', 'raise', 'with', 'lambda',
  'pass', 'break', 'continue', 'yield', 'global', 'nonlocal', 'assert', 'del', 'is',
  'async', 'await', 'None', 'True', 'False', 'self', 'cls',
  // common JS keywords so .js/.ts files don't look bare
  'const', 'let', 'var', 'function', 'new', 'typeof', 'instanceof', 'export', 'default',
  'this', 'null', 'undefined', 'true', 'false', 'await', 'async',
])

// One pass: comments, strings (triple/double/single), numbers, identifiers. Anything between
// matches (operators, whitespace, punctuation) is emitted verbatim so layout is preserved.
const TOKEN_RE =
  /(#[^\n]*|\/\/[^\n]*)|("""[\s\S]*?"""|'''[\s\S]*?'''|`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\b\d[\d_]*\.?\d*\b)|([A-Za-z_$][\w$]*)/g

export function highlight(code) {
  const nodes = []
  let last = 0
  let key = 0
  let m
  TOKEN_RE.lastIndex = 0
  while ((m = TOKEN_RE.exec(code)) !== null) {
    if (m.index > last) nodes.push(code.slice(last, m.index))
    const [text, comment, string, number, ident] = m
    if (comment) {
      nodes.push(<span key={key++} className="tok-cmt">{comment}</span>)
    } else if (string) {
      nodes.push(<span key={key++} className="tok-num">{string}</span>)
    } else if (number) {
      nodes.push(<span key={key++} className="tok-num">{number}</span>)
    } else if (ident) {
      if (KEYWORDS.has(ident)) {
        nodes.push(<span key={key++} className="tok-kw">{ident}</span>)
      } else if (code[TOKEN_RE.lastIndex] === '(') {
        nodes.push(<span key={key++} className="tok-fn">{ident}</span>)
      } else {
        nodes.push(ident)
      }
    }
    last = m.index + text.length
  }
  if (last < code.length) nodes.push(code.slice(last))
  return nodes
}
