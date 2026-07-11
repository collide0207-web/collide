import { describe, expect, it } from 'vitest'
import { buildProgram, canonical, formatSignature, outputMatches, parseType } from './harness'
import type { ProblemHarness } from '../api/types'

const twoSum: ProblemHarness = {
  entry: 'twoSum',
  params: [{ name: 'nums', type: 'int[]' }, { name: 'target', type: 'int' }],
  returns: 'int[]',
  tests: [{ input: [[2, 7, 11, 15], 9], expected: [0, 1] }],
}

describe('existing scalar/array codegen (characterization)', () => {
  it('formats a signature', () => {
    expect(formatSignature(twoSum)).toBe('twoSum(nums: int[], target: int) → int[]')
  })

  it('JS bakes array + scalar literals and prints canonical JSON', () => {
    const p = buildProgram('javascript', 'function twoSum(nums,target){return [0,1]}', twoSum, [[2, 7, 11, 15], 9])
    expect(p).toContain('twoSum([2,7,11,15], 9)')
    expect(p).toContain('JSON.stringify')
  })

  it('Python calls Solution().entry with literals', () => {
    const p = buildProgram('python', 'class Solution:\n    def twoSum(self,nums,target):\n        return [0,1]', twoSum, [[2, 7, 11, 15], 9])
    expect(p).toContain('Solution().twoSum([2,7,11,15], 9)')
    expect(p).toContain('json.dumps')
  })

  it('C++ declares typed locals and prints an int vector', () => {
    const p = buildProgram('cpp', 'class Solution{public: vector<int> twoSum(vector<int>& n,int t){return {0,1};}};', twoSum, [[2, 7, 11, 15], 9])
    expect(p).toContain('vector<int> __a0 = {2,7,11,15};')
    expect(p).toContain('int __a1 = 9;')
  })

  it('Java declares typed locals and prints an int array', () => {
    const p = buildProgram('java', 'class Solution{ int[] twoSum(int[] n,int t){return new int[]{0,1};}}', twoSum, [[2, 7, 11, 15], 9])
    expect(p).toContain('int[] __a0 = new int[]{2,7,11,15};')
  })

  it('outputMatches tolerates trailing debug lines', () => {
    expect(outputMatches('debug\n[0,1]', [0, 1])).toBe(true)
    expect(outputMatches('[0,1]', [0, 1])).toBe(true)
    expect(outputMatches('[1,0]', [0, 1])).toBe(false)
  })

  it('canonical produces no-space JSON', () => {
    expect(canonical([0, 1])).toBe('[0,1]')
  })
})

describe('parseType', () => {
  it('parses scalars and arrays as before', () => {
    expect(parseType('int')).toEqual({ kind: 'scalar', elem: 'int' })
    expect(parseType('int[]')).toEqual({ kind: 'scalar', elem: 'int[]' })
  })
  it('parses object node types with element', () => {
    expect(parseType('list-node<int>')).toEqual({ kind: 'list-node', elem: 'int' })
    expect(parseType('tree-node<int>')).toEqual({ kind: 'tree-node', elem: 'int' })
    expect(parseType('graph-node<int>')).toEqual({ kind: 'graph-node', elem: 'int' })
  })
  it('parses operations', () => {
    expect(parseType('operations')).toEqual({ kind: 'operations', elem: '' })
  })
  it('parses nested array<list-node<int>>', () => {
    expect(parseType('array<list-node<int>>')).toEqual({ kind: 'array', of: { kind: 'list-node', elem: 'int' } })
  })
})

const reverseList: ProblemHarness = {
  entry: 'reverseList',
  params: [{ name: 'head', type: 'list-node<int>' }],
  returns: 'list-node<int>',
  tests: [{ input: [[1, 2, 3]], expected: [3, 2, 1] }],
}

function evalJs(program: string | null): string {
  expect(program).not.toBeNull()
  let out = ''
  const log = console.log
  console.log = (s: string) => { out += s }
  try { new Function(program!)() } finally { console.log = log }
  return out
}

describe('list-node codegen', () => {
  it('JS builds a list from the array and prints it back as an array', () => {
    const p = buildProgram('javascript', 'function reverseList(head){return head}', reverseList, [[1, 2, 3]])
    expect(p).toContain('function ListNode')
    expect(p).toContain('__toList([1,2,3])')
    expect(p).toContain('__fromList(')
  })
  it('Python injects ListNode and (de)serializers', () => {
    const p = buildProgram('python', 'class Solution:\n    def reverseList(self,head):\n        return head', reverseList, [[1, 2, 3]])
    expect(p).toContain('class ListNode')
    expect(p).toContain('__to_list([1,2,3])')
    expect(p).toContain('__from_list(')
  })
  it('C++ injects ListNode + builds/serializes', () => {
    const p = buildProgram('cpp', 'class Solution{public: ListNode* reverseList(ListNode* h){return h;}};', reverseList, [[1, 2, 3]])
    expect(p).toContain('struct ListNode')
    expect(p).toContain('__toList({1,2,3})')
    expect(p).toContain('__fromList(')
  })
  it('Java injects ListNode + builds/serializes', () => {
    const p = buildProgram('java', 'class Solution{ ListNode reverseList(ListNode h){return h;}}', reverseList, [[1, 2, 3]])
    expect(p).toContain('static class ListNode')
    expect(p).toContain('__toList(new int[]{1,2,3})')
    expect(p).toContain('__fromList(')
  })
  it('JS list-node round-trips through a real reverse (eval smoke)', () => {
    const p = buildProgram('javascript', 'function reverseList(head){let prev=null;while(head){const n=head.next;head.next=prev;prev=head;head=n;}return prev}', reverseList, [[1, 2, 3]])
    expect(outputMatches(evalJs(p), [3, 2, 1])).toBe(true)
  })
})

const maxDepth: ProblemHarness = {
  entry: 'maxDepth',
  params: [{ name: 'root', type: 'tree-node<int>' }],
  returns: 'int',
  tests: [{ input: [[3, 9, 20, null, null, 15, 7]], expected: 3 }],
}
const invert: ProblemHarness = {
  entry: 'invertTree',
  params: [{ name: 'root', type: 'tree-node<int>' }],
  returns: 'tree-node<int>',
  tests: [{ input: [[1, 2, 3]], expected: [1, 3, 2] }],
}

describe('tree-node codegen', () => {
  it('JS builds a tree from level-order (nulls) and returns int', () => {
    const p = buildProgram('javascript', 'function maxDepth(r){return r?1+Math.max(maxDepth(r.left),maxDepth(r.right)):0}', maxDepth, [[3, 9, 20, null, null, 15, 7]])
    expect(p).toContain('function TreeNode')
    expect(p).toContain('__toTree([3,9,20,null,null,15,7])')
  })
  it('Python injects TreeNode', () => {
    const p = buildProgram('python', 'class Solution:\n    def maxDepth(self,r):\n        return 0', maxDepth, [[3, 9, 20, null, null, 15, 7]])
    expect(p).toContain('class TreeNode')
    expect(p).toContain('__to_tree([3,9,20,None,None,15,7])')
  })
  it('C++ renders nulls in the wire builder', () => {
    const p = buildProgram('cpp', 'class Solution{public: int maxDepth(TreeNode* r){return 0;}};', maxDepth, [[3, 9, 20, null, null, 15, 7]])
    expect(p).toContain('struct TreeNode')
    expect(p).toContain('__toTree(')
  })
  it('Java uses a nullable Integer[] wire', () => {
    const p = buildProgram('java', 'class Solution{ int maxDepth(TreeNode r){return 0;}}', maxDepth, [[3, 9, 20, null, null, 15, 7]])
    expect(p).toContain('static class TreeNode')
    expect(p).toContain('__toTree(new Integer[]{3,9,20,null,null,15,7})')
  })
  it('JS invert round-trips and serializes back to trimmed level-order (eval smoke)', () => {
    const p = buildProgram('javascript', 'function invertTree(r){if(!r)return null;const t=r.left;r.left=invertTree(r.right);r.right=invertTree(t);return r}', invert, [[1, 2, 3]])
    expect(outputMatches(evalJs(p), [1, 3, 2])).toBe(true)
  })
})
