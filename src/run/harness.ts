/**
 * Test-runner codegen. Turns a problem's harness metadata + the user's `Solution`
 * into a complete, runnable program per language, so "Run" works LeetCode-style: the
 * user writes only the method, we generate the `main`/driver that builds the arguments
 * as native literals, calls the entry point, and prints the result as canonical JSON.
 *
 * Design notes:
 *  - Arguments are baked in as LITERALS (not parsed from stdin) — each Run recompiles
 *    anyway, so per-case codegen is free and avoids writing a JSON parser in C++/Java.
 *  - The generated driver is APPENDED after the user's code; language preludes
 *    (#include / import) live in the starter template itself, so compile-error line
 *    numbers still line up with what the user sees in the editor.
 *  - Output is canonical JSON with no spaces, matched against JSON.stringify(expected).
 */
import type { ExecutionStatus, ProblemHarness } from '../api/types'

/** Result of running one test case through the harness. `pass: null` = custom/no expected. */
export interface CaseResult {
  status: ExecutionStatus
  stdout: string
  stderr: string
  pass: boolean | null
}

export function hasHarness(h: ProblemHarness | null | undefined): h is ProblemHarness {
  return !!h && typeof h.entry === 'string' && Array.isArray(h.params)
}

export type TypeTag =
  | { kind: 'scalar' | 'list-node' | 'tree-node' | 'graph-node' | 'operations'; elem: string }
  | { kind: 'array'; of: TypeTag }

/** Parse a harness type tag. Scalars/plain arrays are `scalar` (their raw tag kept in `elem`,
 *  so existing literal codegen keeps switching on `int`/`int[]`/… unchanged). Object node types
 *  and the `operations` mode get their own kinds; `array<T>` wraps a parsed element type. */
export function parseType(tag: string): TypeTag {
  const t = tag.trim()
  if (t === 'operations') return { kind: 'operations', elem: '' }
  const arr = /^array<(.+)>$/.exec(t)
  if (arr) return { kind: 'array', of: parseType(arr[1]) }
  const node = /^(list-node|tree-node|graph-node)<(.+)>$/.exec(t)
  if (node) return { kind: node[1] as 'list-node' | 'tree-node' | 'graph-node', elem: node[2] }
  return { kind: 'scalar', elem: t }
}

/** Human-readable signature shown above the statement, e.g. `maxProfit(prices: int[]) → int`. */
export function formatSignature(h: ProblemHarness): string {
  const params = h.params.map((p) => `${p.name}: ${p.type}`).join(', ')
  return `${h.entry}(${params}) → ${h.returns}`
}

/** Canonical JSON text used both for expected-output display and match comparison. */
export function canonical(value: unknown): string {
  return JSON.stringify(value)
}

/** True if a program's stdout matches the expected value (tolerates trailing debug lines). */
export function outputMatches(stdout: string, expected: unknown): boolean {
  const want = canonical(expected)
  const trimmed = stdout.trim()
  if (trimmed === want) return true
  const lines = trimmed.split('\n')
  return lines[lines.length - 1]?.trim() === want
}

// --- literals -------------------------------------------------------------------

const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** Shared array/scalar syntax for JS & Python (differ only in bool casing). */
function bracketLiteral(type: string, v: unknown): string {
  switch (type) {
    case 'int':
    case 'long':
    case 'double':
      return String(v)
    case 'string':
      return JSON.stringify(v)
    case 'int[]':
    case 'double[]':
      return `[${asArr(v).join(',')}]`
    case 'string[]':
      return `[${asArr(v).map((x) => JSON.stringify(x)).join(',')}]`
    case 'int[][]':
      return `[${asArr(v).map((r) => `[${asArr(r).join(',')}]`).join(',')}]`
    default:
      return JSON.stringify(v)
  }
}

function jsLiteral(type: string, v: unknown): string {
  if (type === 'bool') return v ? 'true' : 'false'
  return bracketLiteral(type, v)
}

function pyLiteral(type: string, v: unknown): string {
  if (type === 'bool') return v ? 'True' : 'False'
  return bracketLiteral(type, v)
}

function cppLiteral(type: string, v: unknown): string {
  switch (type) {
    case 'int':
    case 'long':
    case 'double':
      return String(v)
    case 'bool':
      return v ? 'true' : 'false'
    case 'string':
      return JSON.stringify(v)
    case 'int[]':
    case 'double[]':
      return `{${asArr(v).join(',')}}`
    case 'string[]':
      return `{${asArr(v).map((x) => JSON.stringify(x)).join(',')}}`
    case 'int[][]':
      return `{${asArr(v).map((r) => `{${asArr(r).join(',')}}`).join(',')}}`
    default:
      return JSON.stringify(v)
  }
}

function javaLiteral(type: string, v: unknown): string {
  switch (type) {
    case 'int':
    case 'long':
    case 'double':
      return String(v)
    case 'bool':
      return v ? 'true' : 'false'
    case 'string':
      return JSON.stringify(v)
    case 'int[]':
      return `new int[]{${asArr(v).join(',')}}`
    case 'double[]':
      return `new double[]{${asArr(v).join(',')}}`
    case 'string[]':
      return `new String[]{${asArr(v).map((x) => JSON.stringify(x)).join(',')}}`
    case 'int[][]':
      return `new int[][]{${asArr(v).map((r) => `{${asArr(r).join(',')}}`).join(',')}}`
    default:
      return JSON.stringify(v)
  }
}

const CPP_TYPE: Record<string, string> = {
  int: 'int', long: 'long long', double: 'double', bool: 'bool', string: 'string',
  'int[]': 'vector<int>', 'double[]': 'vector<double>', 'string[]': 'vector<string>', 'int[][]': 'vector<vector<int>>',
}
const JAVA_TYPE: Record<string, string> = {
  int: 'int', long: 'long', double: 'double', bool: 'boolean', string: 'String',
  'int[]': 'int[]', 'double[]': 'double[]', 'string[]': 'String[]', 'int[][]': 'int[][]',
}

// --- result printers ------------------------------------------------------------

function cppPrint(returns: string, expr: string): string {
  switch (returns) {
    case 'bool':
      return `cout << (${expr} ? "true" : "false");`
    case 'string':
      return `cout << "\\"" << ${expr} << "\\"";`
    case 'int[]':
    case 'double[]': {
      return `{ auto __v = ${expr}; cout << "["; for (size_t __i = 0; __i < __v.size(); ++__i) { if (__i) cout << ","; cout << __v[__i]; } cout << "]"; }`
    }
    default:
      return `cout << (${expr});`
  }
}

function javaPrint(returns: string, expr: string): string {
  switch (returns) {
    case 'bool':
      return `System.out.print((${expr}) ? "true" : "false");`
    case 'string':
      return `System.out.print("\\"" + (${expr}) + "\\"");`
    case 'int[]':
    case 'double[]': {
      return `{ var __v = ${expr}; StringBuilder __sb = new StringBuilder("["); for (int __i = 0; __i < __v.length; __i++) { if (__i > 0) __sb.append(","); __sb.append(__v[__i]); } __sb.append("]"); System.out.print(__sb); }`
    }
    default:
      return `System.out.print(${expr});`
  }
}

// --- object-type codegen hooks --------------------------------------------------

/** Expression passed as the i-th argument. Scalars reuse the literal bakers; object
 *  types wrap the wire literal in a deserializer defined by the prelude. */
function argExpr(language: string, tag: TypeTag, value: unknown): string {
  if (tag.kind === 'scalar') {
    switch (language) {
      case 'javascript': return jsLiteral(tag.elem, value)
      case 'python': return pyLiteral(tag.elem, value)
      case 'cpp': return cppLiteral(tag.elem, value)
      case 'java': return javaLiteral(tag.elem, value)
    }
  }
  if (tag.kind === 'list-node') {
    const lit = argExpr(language, { kind: 'scalar', elem: 'int[]' }, value)
    return language === 'python' ? `__to_list(${lit})` : `__toList(${lit})`
  }
  if (tag.kind === 'tree-node') {
    const lit = nullableWire(language, value)
    return language === 'python' ? `__to_tree(${lit})` : `__toTree(${lit})`
  }
  if (tag.kind === 'graph-node') {
    const lit = argExpr(language, { kind: 'scalar', elem: 'int[][]' }, value)
    return language === 'python' ? `__to_graph(${lit})` : `__toGraph(${lit})`
  }
  if (tag.kind === 'array') {
    if (tag.of.kind === 'list-node') {
      const inner = asArr(value)
      const intArr = { kind: 'scalar', elem: 'int[]' } as const
      switch (language) {
        case 'javascript':
          return `[${inner.map((x) => argExpr('javascript', intArr, x)).join(',')}].map((__x)=>__toList(__x))`
        case 'python':
          return `[__to_list(__x) for __x in [${inner.map((x) => argExpr('python', intArr, x)).join(',')}]]`
        case 'cpp':
          return `vector<ListNode*>{${inner.map((x) => `__toList(${argExpr('cpp', intArr, x)})`).join(', ')}}`
        case 'java':
          return `new ListNode[]{${inner.map((x) => `__toList(${argExpr('java', intArr, x)})`).join(', ')}}`
      }
    }
    throw new Error(`Unsupported array element type: ${tag.of.kind}`)
  }
  // operations handled by a separate driver (see buildProgram).
  return argExpr(language, { kind: 'scalar', elem: 'int[]' }, value)
}

/** Literal for a wire array that may contain nulls (tree level-order / graph guards). */
function nullableWire(language: string, v: unknown): string {
  const a = asArr(v)
  switch (language) {
    case 'javascript': return `[${a.map((x) => (x == null ? 'null' : String(x))).join(',')}]`
    case 'python': return `[${a.map((x) => (x == null ? 'None' : String(x))).join(',')}]`
    // C++: build a vector<int>; encode null as the INT_MIN sentinel (__NUL), which
    // __toTree treats as "no node". Real node values never reach INT_MIN.
    case 'cpp': return `{${a.map((x) => (x == null ? '__NUL' : String(x))).join(',')}}`
    // Java: genuine null flows through an Integer[].
    case 'java': return `new Integer[]{${a.map((x) => (x == null ? 'null' : String(x))).join(',')}}`
    default: return '[]'
  }
}

/** JS/Py: the expression fed to the printer, mapping object returns through a serializer. */
function printExprJs(tag: TypeTag, expr: string): string {
  if (tag.kind === 'list-node') return `__fromList(${expr})`
  if (tag.kind === 'tree-node') return `__fromTree(${expr})`
  if (tag.kind === 'graph-node') return `__fromGraph(${expr})`
  return expr
}
function printExprPy(tag: TypeTag, expr: string): string {
  if (tag.kind === 'list-node') return `__from_list(${expr})`
  if (tag.kind === 'tree-node') return `__from_tree(${expr})`
  if (tag.kind === 'graph-node') return `__from_graph(${expr})`
  return expr
}

/** C++/Java: the full print statement. Object serializers already yield canonical JSON
 *  strings, so print them directly; scalars/arrays fall through to the existing printers. */
function cppPrintTag(tag: TypeTag, returns: string, expr: string): string {
  if (tag.kind === 'list-node') return `cout << __fromList(${expr});`
  if (tag.kind === 'tree-node') return `cout << __fromTree(${expr});`
  if (tag.kind === 'graph-node') return `cout << __fromGraph(${expr});`
  return cppPrint(returns, expr)
}
function javaPrintTag(tag: TypeTag, returns: string, expr: string): string {
  if (tag.kind === 'list-node') return `System.out.print(__fromList(${expr}));`
  if (tag.kind === 'tree-node') return `System.out.print(__fromTree(${expr}));`
  if (tag.kind === 'graph-node') return `System.out.print(__fromGraph(${expr}));`
  return javaPrint(returns, expr)
}

/** Declared local type for the i-th argument (object types become pointers/refs). */
function cppDeclType(tag: TypeTag, raw: string): string {
  if (tag.kind === 'list-node') return 'ListNode*'
  if (tag.kind === 'tree-node') return 'TreeNode*'
  if (tag.kind === 'graph-node') return 'Node*'
  if (tag.kind === 'array' && tag.of.kind === 'list-node') return 'vector<ListNode*>'
  return CPP_TYPE[raw] ?? 'auto'
}
function javaDeclType(tag: TypeTag, raw: string): string {
  if (tag.kind === 'list-node') return 'ListNode'
  if (tag.kind === 'tree-node') return 'TreeNode'
  if (tag.kind === 'graph-node') return 'Node'
  if (tag.kind === 'array' && tag.of.kind === 'list-node') return 'ListNode[]'
  return JAVA_TYPE[raw] ?? 'var'
}

/** True if any param or the return uses `kind` (recursing into `array<…>`). */
function usesKind(h: ProblemHarness, kind: TypeTag['kind']): boolean {
  const hit = (t: TypeTag): boolean => t.kind === kind || (t.kind === 'array' && hit(t.of))
  return h.params.some((p) => hit(parseType(p.type))) || hit(parseType(h.returns))
}

// --- injected preludes ----------------------------------------------------------

const LIST_PRELUDE: Record<string, string> = {
  javascript:
    'function ListNode(val, next){ this.val = val===undefined?0:val; this.next = next===undefined?null:next; }\n' +
    'function __toList(a){ let d=new ListNode(0), c=d; for(const x of a){ c.next=new ListNode(x); c=c.next; } return d.next; }\n' +
    'function __fromList(n){ const r=[]; while(n){ r.push(n.val); n=n.next; } return r; }\n\n',
  python:
    'class ListNode:\n    def __init__(self, val=0, next=None):\n        self.val=val; self.next=next\n' +
    'def __to_list(a):\n    d=ListNode(0); c=d\n    for x in a:\n        c.next=ListNode(x); c=c.next\n    return d.next\n' +
    'def __from_list(n):\n    r=[]\n    while n:\n        r.append(n.val); n=n.next\n    return r\n\n',
  cpp:
    'struct ListNode { int val; ListNode* next; ListNode(int x):val(x),next(nullptr){} };\n' +
    'static ListNode* __toList(vector<int> a){ ListNode d(0); ListNode* c=&d; for(int x:a){ c->next=new ListNode(x); c=c->next; } return d.next; }\n' +
    'static string __fromList(ListNode* n){ string s="["; bool f=true; while(n){ if(!f) s+=","; s+=to_string(n->val); f=false; n=n->next; } s+="]"; return s; }\n\n',
  java:
    'static class ListNode { int val; ListNode next; ListNode(int x){ val=x; } }\n' +
    'static ListNode __toList(int[] a){ ListNode d=new ListNode(0), c=d; for(int x:a){ c.next=new ListNode(x); c=c.next; } return d.next; }\n' +
    'static String __fromList(ListNode n){ StringBuilder b=new StringBuilder("["); boolean f=true; while(n!=null){ if(!f) b.append(","); b.append(n.val); f=false; n=n.next; } b.append("]"); return b.toString(); }\n\n',
}

const TREE_PRELUDE: Record<string, string> = {
  javascript:
    'function TreeNode(val,left,right){ this.val=val===undefined?0:val; this.left=left||null; this.right=right||null; }\n' +
    'function __toTree(a){ if(!a.length||a[0]==null) return null; const root=new TreeNode(a[0]); const q=[root]; let i=1;\n' +
    '  while(q.length&&i<a.length){ const n=q.shift();\n' +
    '    if(i<a.length){ const v=a[i++]; if(v!=null){ n.left=new TreeNode(v); q.push(n.left); } }\n' +
    '    if(i<a.length){ const v=a[i++]; if(v!=null){ n.right=new TreeNode(v); q.push(n.right); } } }\n' +
    '  return root; }\n' +
    'function __fromTree(root){ const out=[]; const q=[root]; while(q.length){ const n=q.shift(); if(n){ out.push(n.val); q.push(n.left,n.right); } else out.push(null); }\n' +
    '  while(out.length && out[out.length-1]==null) out.pop(); return out; }\n\n',
  python:
    'class TreeNode:\n    def __init__(self, val=0, left=None, right=None):\n        self.val=val; self.left=left; self.right=right\n' +
    'def __to_tree(a):\n    if not a or a[0] is None: return None\n    root=TreeNode(a[0]); q=[root]; i=1\n' +
    '    while q and i<len(a):\n        n=q.pop(0)\n' +
    '        if i<len(a):\n            v=a[i]; i+=1\n            if v is not None: n.left=TreeNode(v); q.append(n.left)\n' +
    '        if i<len(a):\n            v=a[i]; i+=1\n            if v is not None: n.right=TreeNode(v); q.append(n.right)\n    return root\n' +
    'def __from_tree(root):\n    out=[]; q=[root]\n    while q:\n        n=q.pop(0)\n        if n: out.append(n.val); q.append(n.left); q.append(n.right)\n        else: out.append(None)\n' +
    '    while out and out[-1] is None: out.pop()\n    return out\n\n',
  cpp:
    'static const int __NUL = INT_MIN;\n' +
    'struct TreeNode { int val; TreeNode* left; TreeNode* right; TreeNode(int x):val(x),left(nullptr),right(nullptr){} };\n' +
    'static TreeNode* __toTree(vector<int> a){ if(a.empty()||a[0]==__NUL) return nullptr; TreeNode* root=new TreeNode(a[0]); queue<TreeNode*> q; q.push(root); size_t i=1;\n' +
    '  while(!q.empty()&&i<a.size()){ TreeNode* n=q.front(); q.pop();\n' +
    '    if(i<a.size()){ int v=a[i++]; if(v!=__NUL){ n->left=new TreeNode(v); q.push(n->left); } }\n' +
    '    if(i<a.size()){ int v=a[i++]; if(v!=__NUL){ n->right=new TreeNode(v); q.push(n->right); } } }\n' +
    '  return root; }\n' +
    'static string __fromTree(TreeNode* root){ vector<string> out; queue<TreeNode*> q; q.push(root);\n' +
    '  while(!q.empty()){ TreeNode* n=q.front(); q.pop(); if(n){ out.push_back(to_string(n->val)); q.push(n->left); q.push(n->right); } else out.push_back("null"); }\n' +
    '  while(!out.empty()&&out.back()=="null") out.pop_back(); string s="["; for(size_t i=0;i<out.size();++i){ if(i) s+=","; s+=out[i]; } s+="]"; return s; }\n\n',
  java:
    'static class TreeNode { int val; TreeNode left, right; TreeNode(int x){ val=x; } }\n' +
    'static TreeNode __toTree(Integer[] a){ if(a.length==0||a[0]==null) return null; TreeNode root=new TreeNode(a[0]); java.util.Queue<TreeNode> q=new java.util.LinkedList<>(); q.add(root); int i=1;\n' +
    '  while(!q.isEmpty()&&i<a.length){ TreeNode n=q.poll();\n' +
    '    if(i<a.length){ Integer v=a[i++]; if(v!=null){ n.left=new TreeNode(v); q.add(n.left); } }\n' +
    '    if(i<a.length){ Integer v=a[i++]; if(v!=null){ n.right=new TreeNode(v); q.add(n.right); } } }\n' +
    '  return root; }\n' +
    'static String __fromTree(TreeNode root){ java.util.List<String> out=new java.util.ArrayList<>(); java.util.Queue<TreeNode> q=new java.util.LinkedList<>(); q.add(root);\n' +
    '  while(!q.isEmpty()){ TreeNode n=q.poll(); if(n!=null){ out.add(String.valueOf(n.val)); q.add(n.left); q.add(n.right); } else out.add("null"); }\n' +
    '  while(!out.isEmpty()&&out.get(out.size()-1).equals("null")) out.remove(out.size()-1); return "["+String.join(",",out)+"]"; }\n\n',
}

const GRAPH_PRELUDE: Record<string, string> = {
  javascript:
    'function Node(val, neighbors){ this.val=val===undefined?0:val; this.neighbors=neighbors||[]; }\n' +
    'function __toGraph(adj){ if(!adj.length) return null; const nodes=adj.map((_,i)=>new Node(i+1));\n' +
    '  adj.forEach((nb,i)=>{ nodes[i].neighbors = nb.map((v)=>nodes[v-1]); }); return nodes[0]; }\n' +
    'function __fromGraph(node){ if(!node) return []; const seen=new Map(); const q=[node]; seen.set(node.val,node);\n' +
    '  while(q.length){ const n=q.shift(); for(const m of n.neighbors){ if(!seen.has(m.val)){ seen.set(m.val,m); q.push(m); } } }\n' +
    '  const vals=[...seen.keys()].sort((a,b)=>a-b); return vals.map((v)=>seen.get(v).neighbors.map((m)=>m.val).sort((a,b)=>a-b)); }\n\n',
  python:
    'class Node:\n    def __init__(self, val=0, neighbors=None):\n        self.val=val; self.neighbors=neighbors if neighbors else []\n' +
    'def __to_graph(adj):\n    if not adj: return None\n    nodes=[Node(i+1) for i in range(len(adj))]\n' +
    '    for i,nb in enumerate(adj):\n        nodes[i].neighbors=[nodes[v-1] for v in nb]\n    return nodes[0]\n' +
    'def __from_graph(node):\n    if not node: return []\n    seen={node.val:node}; q=[node]\n' +
    '    while q:\n        n=q.pop(0)\n        for m in n.neighbors:\n            if m.val not in seen: seen[m.val]=m; q.append(m)\n' +
    '    return [sorted(x.val for x in seen[v].neighbors) for v in sorted(seen)]\n\n',
  cpp:
    'struct Node { int val; vector<Node*> neighbors; Node(int x):val(x){} };\n' +
    'static Node* __toGraph(vector<vector<int>> adj){ if(adj.empty()) return nullptr; vector<Node*> nodes; for(size_t i=0;i<adj.size();++i) nodes.push_back(new Node(i+1));\n' +
    '  for(size_t i=0;i<adj.size();++i) for(int v:adj[i]) nodes[i]->neighbors.push_back(nodes[v-1]); return nodes[0]; }\n' +
    'static string __fromGraph(Node* node){ if(!node) return "[]"; map<int,Node*> seen; queue<Node*> q; q.push(node); seen[node->val]=node;\n' +
    '  while(!q.empty()){ Node* n=q.front(); q.pop(); for(Node* m:n->neighbors) if(!seen.count(m->val)){ seen[m->val]=m; q.push(m); } }\n' +
    '  string s="["; bool f1=true; for(auto& kv:seen){ if(!f1) s+=","; f1=false; vector<int> vs; for(Node* m:kv.second->neighbors) vs.push_back(m->val); sort(vs.begin(),vs.end());\n' +
    '    s+="["; for(size_t i=0;i<vs.size();++i){ if(i) s+=","; s+=to_string(vs[i]); } s+="]"; } s+="]"; return s; }\n\n',
  java:
    'static class Node { int val; java.util.List<Node> neighbors=new java.util.ArrayList<>(); Node(int x){ val=x; } }\n' +
    'static Node __toGraph(int[][] adj){ if(adj.length==0) return null; Node[] nodes=new Node[adj.length]; for(int i=0;i<adj.length;i++) nodes[i]=new Node(i+1);\n' +
    '  for(int i=0;i<adj.length;i++) for(int v:adj[i]) nodes[i].neighbors.add(nodes[v-1]); return nodes[0]; }\n' +
    'static String __fromGraph(Node node){ if(node==null) return "[]"; java.util.TreeMap<Integer,Node> seen=new java.util.TreeMap<>(); java.util.Queue<Node> q=new java.util.LinkedList<>(); q.add(node); seen.put(node.val,node);\n' +
    '  while(!q.isEmpty()){ Node n=q.poll(); for(Node m:n.neighbors) if(!seen.containsKey(m.val)){ seen.put(m.val,m); q.add(m); } }\n' +
    '  StringBuilder b=new StringBuilder("["); boolean f1=true; for(Node n:seen.values()){ if(!f1) b.append(","); f1=false; java.util.List<Integer> vs=new java.util.ArrayList<>(); for(Node m:n.neighbors) vs.add(m.val); java.util.Collections.sort(vs);\n' +
    '    b.append("["); for(int i=0;i<vs.size();i++){ if(i>0) b.append(","); b.append(vs.get(i)); } b.append("]"); } b.append("]"); return b.toString(); }\n\n',
}

// --- program builders -----------------------------------------------------------

/** Per-language type definitions + (de)serializers injected ahead of the driver.
 *  `userCode` lets us skip a definition the user already provides (mirrors the
 *  #include/import guards in buildProgram). */
function preludeFor(language: string, h: ProblemHarness, userCode: string): string {
  let out = ''
  if (usesKind(h, 'list-node') && !/\b(class|struct)\s+ListNode\b/.test(userCode)) {
    out += LIST_PRELUDE[language] ?? ''
  }
  if (usesKind(h, 'tree-node') && !/\b(class|struct)\s+TreeNode\b/.test(userCode)) {
    out += TREE_PRELUDE[language] ?? ''
  }
  if (usesKind(h, 'graph-node') && !/\b(class|struct)\s+Node\b/.test(userCode)) {
    out += GRAPH_PRELUDE[language] ?? ''
  }
  return out
}

/**
 * Compose a complete runnable program: the user's code plus a generated driver that
 * calls `entry` with `args` (in param order) and prints the result as canonical JSON.
 * Returns null if the language isn't supported by the codegen yet.
 */
/** One design-problem op: `[methodName, [args...]]`. The first op is the constructor. */
type Op = [string, unknown[]]
type OpsSeq = Op[]

function pyVal(v: unknown): string {
  if (v === true) return 'True'
  if (v === false) return 'False'
  if (v === null) return 'None'
  return JSON.stringify(v)
}

/**
 * Driver for `operations` (design) problems: instantiate the class named by the first op,
 * dispatch each subsequent op as a method call, and print the collected returns (constructor
 * slot = null) as canonical JSON. Only JS/Python execute in this environment; compiled-language
 * dispatch (void-vs-value detection) is owned by the SP4 server judge, so cpp/java return null.
 */
function buildOperationsProgram(language: string, userCode: string, ops: OpsSeq): string | null {
  const [ctor, ...calls] = ops
  const ctorName = ctor[0]
  switch (language) {
    case 'javascript': {
      const lines = [
        `const __obj = new ${ctorName}(${(ctor[1] ?? []).map((v) => JSON.stringify(v)).join(', ')});`,
        `const __res = [null];`,
        ...calls.map((op) => `__res.push((()=>{ const __r = __obj[${JSON.stringify(op[0])}](${(op[1] ?? []).map((v) => JSON.stringify(v)).join(', ')}); return __r===undefined?null:__r; })());`),
        `console.log(JSON.stringify(__res));`,
      ]
      return `${userCode}\n\n;(function(){\n${lines.join('\n')}\n})();\n`
    }
    case 'python': {
      const lines = [
        `__obj = ${ctorName}(${(ctor[1] ?? []).map(pyVal).join(', ')})`,
        `__res = [None]`,
        ...calls.map((op) => `__res.append(__obj.${op[0]}(${(op[1] ?? []).map(pyVal).join(', ')}))`),
        `import json`,
        `print(json.dumps(__res, separators=(',', ':')))`,
      ]
      return `${userCode}\n\n${lines.join('\n')}\n`
    }
    default:
      return null // operations dispatch for compiled languages lands with the SP4 server judge
  }
}

export function buildProgram(
  language: string,
  userCode: string,
  h: ProblemHarness,
  args: unknown[],
): string | null {
  if (h.params.length === 1 && parseType(h.params[0].type).kind === 'operations') {
    return buildOperationsProgram(language, userCode, args[0] as OpsSeq)
  }

  const retTag = parseType(h.returns)

  switch (language) {
    case 'javascript': {
      const prelude = preludeFor('javascript', h, userCode)
      const call = `${h.entry}(${h.params.map((p, i) => argExpr('javascript', parseType(p.type), args[i])).join(', ')})`
      return `${prelude}${userCode}\n\n;(function(){ console.log(JSON.stringify(${printExprJs(retTag, call)})); })();\n`
    }
    case 'python': {
      const prelude = preludeFor('python', h, userCode)
      const call = `Solution().${h.entry}(${h.params.map((p, i) => argExpr('python', parseType(p.type), args[i])).join(', ')})`
      return `${prelude}${userCode}\n\nimport json\nprint(json.dumps(${printExprPy(retTag, call)}, separators=(',', ':')))\n`
    }
    case 'cpp': {
      const decls = h.params
        .map((p, i) => `    ${cppDeclType(parseType(p.type), p.type)} __a${i} = ${argExpr('cpp', parseType(p.type), args[i])};`)
        .join('\n')
      const callArgs = h.params.map((_, i) => `__a${i}`).join(', ')
      const print = cppPrintTag(retTag, h.returns, `__sol.${h.entry}(${callArgs})`)
      // Guarantee the driver's includes even if the user's saved code stripped them
      // (a bare `class Solution` won't compile against the generated main otherwise).
      const includes = /#include\s*<bits\/stdc\+\+\.h>/.test(userCode) ? '' : '#include <bits/stdc++.h>\nusing namespace std;\n\n'
      const prelude = preludeFor('cpp', h, userCode)
      return `${includes}${prelude}${userCode}\n\nint main() {\n    Solution __sol;\n${decls}\n    ${print}\n    return 0;\n}\n`
    }
    case 'java': {
      const decls = h.params
        .map((p, i) => `        ${javaDeclType(parseType(p.type), p.type)} __a${i} = ${argExpr('java', parseType(p.type), args[i])};`)
        .join('\n')
      const callArgs = h.params.map((_, i) => `__a${i}`).join(', ')
      const print = javaPrintTag(retTag, h.returns, `__sol.${h.entry}(${callArgs})`)
      // Imports must precede the class; prepend java.util if the user's code lacks it.
      const imports = /import\s+java\.util/.test(userCode) ? '' : 'import java.util.*;\n\n'
      const prelude = preludeFor('java', h, userCode)
      return `${imports}${prelude}${userCode}\n\npublic class Main {\n    public static void main(String[] args) {\n        Solution __sol = new Solution();\n${decls}\n        ${print}\n    }\n}\n`
    }
    default:
      return null
  }
}
