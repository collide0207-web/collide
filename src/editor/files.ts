export interface FileNode {
  name: string
  path: string
  children?: FileNode[]
}

/** Sample project shown in the editor's file explorer. */
export const SAMPLE_TREE: FileNode[] = [
  {
    name: 'my-project',
    path: 'my-project',
    children: [
      {
        name: 'src',
        path: 'my-project/src',
        children: [
          { name: 'index.js', path: 'my-project/src/index.js' },
          { name: 'math.js', path: 'my-project/src/math.js' },
          {
            name: 'components',
            path: 'my-project/src/components',
            children: [{ name: 'App.jsx', path: 'my-project/src/components/App.jsx' }],
          },
        ],
      },
      { name: 'README.md', path: 'my-project/README.md' },
      { name: 'package.json', path: 'my-project/package.json' },
    ],
  },
]

/** Seed contents for the sample files (inserted only if the doc is still empty). */
export const SAMPLE_CONTENT: Record<string, string> = {
  'my-project/src/index.js': `// Entry point — click ▶ Run to execute (JavaScript).
import { add } from './math.js'

console.log('2 + 3 =', add(2, 3))
`,
  'my-project/src/math.js': `export function add(a, b) {
  return a + b
}

export function multiply(a, b) {
  return a * b
}
`,
  'my-project/src/components/App.jsx': `export default function App() {
  return <h1>Hello from Collide</h1>
}
`,
  'my-project/README.md': `# My Project

A sample project inside **Collide**. Edit files live with others.
`,
  'my-project/package.json': `{
  "name": "my-project",
  "version": "1.0.0",
  "type": "module"
}
`,
}

export const DEFAULT_FILE = 'my-project/src/index.js'

const EXT_LANG: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  java: 'java',
  cpp: 'cpp',
  cs: 'csharp',
  go: 'go',
  rs: 'rust',
  php: 'php',
  rb: 'ruby',
  html: 'html',
  css: 'css',
  json: 'json',
  sql: 'sql',
  md: 'markdown',
  sh: 'shell',
  yaml: 'yaml',
  yml: 'yaml',
}

export function languageForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return EXT_LANG[ext] ?? 'plaintext'
}
