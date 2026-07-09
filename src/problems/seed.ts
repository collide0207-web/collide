import type { ProblemDetail } from '../api/types'

/**
 * Compact problem set used by the MOCK api (local dev with no backend). The real
 * catalogue lives in the control plane's seed/neetcode150.json and is served over
 * the API. This mirror keeps the browse + solve experience working offline.
 */
const STARTER = (name: string, sig: string) => ({
  javascript: `function ${name}(${sig}) {\n  // your code here\n}\n`,
  python: `def ${name}(${sig}):\n    # your code here\n    pass\n`,
  java: `class Solution {\n    // implement ${name}\n}\n`,
  cpp: `class Solution {\npublic:\n    // implement ${name}\n};\n`,
})
const LANGS = ['javascript', 'python', 'java', 'cpp']

export const MOCK_PROBLEMS: ProblemDetail[] = [
  {
    id: 'p-two-sum', slug: 'two-sum', title: 'Two Sum', difficulty: 'easy', category: 'Arrays',
    tags: ['array', 'hash-map'], sourceUrl: 'https://leetcode.com/problems/two-sum/',
    description: 'You are given an array of integers and a target value. Return the indices of the two numbers that add up to the target. Each input has exactly one solution, and you may not use the same element twice.',
    examples: [
      { input: 'nums = [2, 7, 11, 15], target = 9', output: '[0, 1]', explanation: 'nums[0] + nums[1] == 9.' },
      { input: 'nums = [3, 2, 4], target = 6', output: '[1, 2]' },
    ],
    constraints: '2 <= nums.length <= 10^4; exactly one valid answer exists.',
    supportedLanguages: LANGS, starterCode: STARTER('twoSum', 'nums, target'),
  },
  {
    id: 'p-valid-anagram', slug: 'valid-anagram', title: 'Valid Anagram', difficulty: 'easy', category: 'Arrays',
    tags: ['string', 'hash-map'], sourceUrl: 'https://leetcode.com/problems/valid-anagram/',
    description: 'Given two strings, determine whether the second is an anagram of the first — the same characters with the same frequencies, reordered.',
    examples: [
      { input: 's = "anagram", t = "nagaram"', output: 'true' },
      { input: 's = "rat", t = "car"', output: 'false' },
    ],
    constraints: '1 <= s.length, t.length <= 5 * 10^4; lowercase English letters.',
    supportedLanguages: LANGS, starterCode: STARTER('isAnagram', 's, t'),
  },
  {
    id: 'p-contains-duplicate', slug: 'contains-duplicate', title: 'Contains Duplicate', difficulty: 'easy', category: 'Arrays',
    tags: ['array', 'hash-set'], sourceUrl: 'https://leetcode.com/problems/contains-duplicate/',
    description: 'Given an integer array, return true if any value appears at least twice, and false if every element is distinct.',
    examples: [
      { input: 'nums = [1, 2, 3, 1]', output: 'true' },
      { input: 'nums = [1, 2, 3, 4]', output: 'false' },
    ],
    constraints: '1 <= nums.length <= 10^5.',
    supportedLanguages: LANGS, starterCode: STARTER('containsDuplicate', 'nums'),
  },
  {
    id: 'p-group-anagrams', slug: 'group-anagrams', title: 'Group Anagrams', difficulty: 'medium', category: 'Arrays',
    tags: ['string', 'hash-map', 'sorting'], sourceUrl: 'https://leetcode.com/problems/group-anagrams/',
    description: null, examples: null, constraints: null,
    supportedLanguages: LANGS, starterCode: STARTER('groupAnagrams', 'strs'),
  },
  {
    id: 'p-valid-palindrome', slug: 'valid-palindrome', title: 'Valid Palindrome', difficulty: 'easy', category: 'Two Pointers',
    tags: ['string', 'two-pointers'], sourceUrl: 'https://leetcode.com/problems/valid-palindrome/',
    description: 'A phrase is a palindrome if, after lowercasing and removing non-alphanumeric characters, it reads the same forwards and backwards. Return whether the input is a palindrome.',
    examples: [
      { input: 's = "A man, a plan, a canal: Panama"', output: 'true' },
      { input: 's = "race a car"', output: 'false' },
    ],
    constraints: '1 <= s.length <= 2 * 10^5.',
    supportedLanguages: LANGS, starterCode: STARTER('isPalindrome', 's'),
  },
  {
    id: 'p-3sum', slug: '3sum', title: '3Sum', difficulty: 'medium', category: 'Two Pointers',
    tags: ['array', 'two-pointers', 'sorting'], sourceUrl: 'https://leetcode.com/problems/3sum/',
    description: null, examples: null, constraints: null,
    supportedLanguages: LANGS, starterCode: STARTER('threeSum', 'nums'),
  },
  {
    id: 'p-best-time', slug: 'best-time-to-buy-and-sell-stock', title: 'Best Time to Buy and Sell Stock', difficulty: 'easy', category: 'Sliding Window',
    tags: ['array', 'sliding-window'], sourceUrl: 'https://leetcode.com/problems/best-time-to-buy-and-sell-stock/',
    description: 'Given daily stock prices, choose one day to buy and a later day to sell. Return the maximum profit, or 0 if none is possible.',
    examples: [
      { input: 'prices = [7, 1, 5, 3, 6, 4]', output: '5', explanation: 'Buy at 1, sell at 6.' },
      { input: 'prices = [7, 6, 4, 3, 1]', output: '0' },
    ],
    constraints: '1 <= prices.length <= 10^5.',
    supportedLanguages: LANGS, starterCode: STARTER('maxProfit', 'prices'),
  },
  {
    id: 'p-valid-parentheses', slug: 'valid-parentheses', title: 'Valid Parentheses', difficulty: 'easy', category: 'Stack',
    tags: ['string', 'stack'], sourceUrl: 'https://leetcode.com/problems/valid-parentheses/',
    description: 'Given a string of only ()[]{}, decide whether every opening bracket is closed by the matching type in the correct order.',
    examples: [
      { input: 's = "()[]{}"', output: 'true' },
      { input: 's = "(]"', output: 'false' },
    ],
    constraints: '1 <= s.length <= 10^4.',
    supportedLanguages: LANGS, starterCode: STARTER('isValid', 's'),
  },
  {
    id: 'p-binary-search', slug: 'binary-search', title: 'Binary Search', difficulty: 'easy', category: 'Binary Search',
    tags: ['array', 'binary-search'], sourceUrl: 'https://leetcode.com/problems/binary-search/',
    description: 'Given a sorted array of distinct integers and a target, return its index or -1. Must run in O(log n).',
    examples: [
      { input: 'nums = [-1, 0, 3, 5, 9, 12], target = 9', output: '4' },
      { input: 'nums = [-1, 0, 3, 5, 9, 12], target = 2', output: '-1' },
    ],
    constraints: '1 <= nums.length <= 10^4; sorted ascending, distinct.',
    supportedLanguages: LANGS, starterCode: STARTER('search', 'nums, target'),
  },
  {
    id: 'p-reverse-linked-list', slug: 'reverse-linked-list', title: 'Reverse Linked List', difficulty: 'easy', category: 'Linked List',
    tags: ['linked-list', 'recursion'], sourceUrl: 'https://leetcode.com/problems/reverse-linked-list/',
    description: 'Given the head of a singly linked list, reverse it and return the new head.',
    examples: [
      { input: 'head = [1, 2, 3, 4, 5]', output: '[5, 4, 3, 2, 1]' },
      { input: 'head = []', output: '[]' },
    ],
    constraints: '0 <= list length <= 5000.',
    supportedLanguages: LANGS, starterCode: STARTER('reverseList', 'head'),
  },
  {
    id: 'p-invert-binary-tree', slug: 'invert-binary-tree', title: 'Invert Binary Tree', difficulty: 'easy', category: 'Trees',
    tags: ['tree', 'dfs', 'recursion'], sourceUrl: 'https://leetcode.com/problems/invert-binary-tree/',
    description: "Given the root of a binary tree, swap every node's left and right children recursively and return the root.",
    examples: [
      { input: 'root = [4, 2, 7, 1, 3, 6, 9]', output: '[4, 7, 2, 9, 6, 3, 1]' },
    ],
    constraints: '0 <= node count <= 100.',
    supportedLanguages: LANGS, starterCode: STARTER('invertTree', 'root'),
  },
  {
    id: 'p-climbing-stairs', slug: 'climbing-stairs', title: 'Climbing Stairs', difficulty: 'easy', category: 'Dynamic Programming',
    tags: ['dynamic-programming', 'math'], sourceUrl: 'https://leetcode.com/problems/climbing-stairs/',
    description: 'You are climbing a staircase with n steps; each move climbs 1 or 2 steps. Return the number of distinct ways to reach the top.',
    examples: [
      { input: 'n = 2', output: '2', explanation: '1+1 or 2.' },
      { input: 'n = 3', output: '3' },
    ],
    constraints: '1 <= n <= 45.',
    supportedLanguages: LANGS, starterCode: STARTER('climbStairs', 'n'),
  },
]
