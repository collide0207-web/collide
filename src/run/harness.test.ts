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
