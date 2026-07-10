import type { ProblemDetail } from '../api/types'

/**
 * Compact problem set used by the MOCK api (local dev with no backend). Generated to
 * mirror the control plane's seed/neetcode150.json so browse + solve + the LeetCode-
 * style harness work offline. Only JavaScript actually executes in mock mode.
 */
export const MOCK_PROBLEMS: ProblemDetail[] = [
  {
    "id": "p-two-sum",
    "slug": "two-sum",
    "title": "Two Sum",
    "difficulty": "easy",
    "category": "Arrays & Hashing",
    "tags": [
      "array",
      "hash-map"
    ],
    "sourceUrl": "https://leetcode.com/problems/two-sum/",
    "description": "You are given an array of integers and a target value. Return the indices of the two numbers that add up to the target. Each input has exactly one solution, and you may not use the same element twice. The answer may be returned in any order.",
    "examples": [
      {
        "input": "nums = [2, 7, 11, 15], target = 9",
        "output": "[0, 1]",
        "explanation": "nums[0] + nums[1] == 9."
      },
      {
        "input": "nums = [3, 2, 4], target = 6",
        "output": "[1, 2]"
      }
    ],
    "constraints": "2 <= nums.length <= 10^4; -10^9 <= nums[i] <= 10^9; exactly one valid answer exists.",
    "supportedLanguages": [
      "javascript",
      "python",
      "java",
      "cpp"
    ],
    "starterCode": {
      "javascript": "function twoSum(nums, target) {\n  // your code here\n}\n",
      "python": "class Solution:\n    def twoSum(self, nums, target):\n        # your code here\n        pass\n",
      "java": "import java.util.*;\n\nclass Solution {\n    public int[] twoSum(int[] nums, int target) {\n        // your code here\n        return new int[]{};\n    }\n}\n",
      "cpp": "#include <bits/stdc++.h>\nusing namespace std;\n\nclass Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        // your code here\n        return {};\n    }\n};\n"
    },
    "harness": {
      "entry": "twoSum",
      "params": [
        {
          "name": "nums",
          "type": "int[]"
        },
        {
          "name": "target",
          "type": "int"
        }
      ],
      "returns": "int[]",
      "tests": [
        {
          "input": [
            [
              2,
              7,
              11,
              15
            ],
            9
          ],
          "expected": [
            0,
            1
          ]
        },
        {
          "input": [
            [
              3,
              2,
              4
            ],
            6
          ],
          "expected": [
            1,
            2
          ]
        }
      ]
    }
  },
  {
    "id": "p-valid-anagram",
    "slug": "valid-anagram",
    "title": "Valid Anagram",
    "difficulty": "easy",
    "category": "Arrays & Hashing",
    "tags": [
      "string",
      "hash-map",
      "sorting"
    ],
    "sourceUrl": "https://leetcode.com/problems/valid-anagram/",
    "description": "Given two strings, determine whether the second is an anagram of the first — that is, whether it uses exactly the same characters with the same frequencies, just reordered.",
    "examples": [
      {
        "input": "s = \"anagram\", t = \"nagaram\"",
        "output": "true"
      },
      {
        "input": "s = \"rat\", t = \"car\"",
        "output": "false"
      }
    ],
    "constraints": "1 <= s.length, t.length <= 5 * 10^4; strings contain lowercase English letters.",
    "supportedLanguages": [
      "javascript",
      "python",
      "java",
      "cpp"
    ],
    "starterCode": {
      "javascript": "function isAnagram(s, t) {\n  // your code here\n}\n",
      "python": "class Solution:\n    def isAnagram(self, s, t):\n        # your code here\n        pass\n",
      "java": "import java.util.*;\n\nclass Solution {\n    public boolean isAnagram(String s, String t) {\n        // your code here\n        return false;\n    }\n}\n",
      "cpp": "#include <bits/stdc++.h>\nusing namespace std;\n\nclass Solution {\npublic:\n    bool isAnagram(string s, string t) {\n        // your code here\n        return false;\n    }\n};\n"
    },
    "harness": {
      "entry": "isAnagram",
      "params": [
        {
          "name": "s",
          "type": "string"
        },
        {
          "name": "t",
          "type": "string"
        }
      ],
      "returns": "bool",
      "tests": [
        {
          "input": [
            "anagram",
            "nagaram"
          ],
          "expected": true
        },
        {
          "input": [
            "rat",
            "car"
          ],
          "expected": false
        }
      ]
    }
  },
  {
    "id": "p-contains-duplicate",
    "slug": "contains-duplicate",
    "title": "Contains Duplicate",
    "difficulty": "easy",
    "category": "Arrays & Hashing",
    "tags": [
      "array",
      "hash-set"
    ],
    "sourceUrl": "https://leetcode.com/problems/contains-duplicate/",
    "description": "Given an integer array, return true if any value appears at least twice, and false if every element is distinct.",
    "examples": [
      {
        "input": "nums = [1, 2, 3, 1]",
        "output": "true"
      },
      {
        "input": "nums = [1, 2, 3, 4]",
        "output": "false"
      }
    ],
    "constraints": "1 <= nums.length <= 10^5; -10^9 <= nums[i] <= 10^9.",
    "supportedLanguages": [
      "javascript",
      "python",
      "java",
      "cpp"
    ],
    "starterCode": {
      "javascript": "function containsDuplicate(nums) {\n  // your code here\n}\n",
      "python": "class Solution:\n    def containsDuplicate(self, nums):\n        # your code here\n        pass\n",
      "java": "import java.util.*;\n\nclass Solution {\n    public boolean containsDuplicate(int[] nums) {\n        // your code here\n        return false;\n    }\n}\n",
      "cpp": "#include <bits/stdc++.h>\nusing namespace std;\n\nclass Solution {\npublic:\n    bool containsDuplicate(vector<int>& nums) {\n        // your code here\n        return false;\n    }\n};\n"
    },
    "harness": {
      "entry": "containsDuplicate",
      "params": [
        {
          "name": "nums",
          "type": "int[]"
        }
      ],
      "returns": "bool",
      "tests": [
        {
          "input": [
            [
              1,
              2,
              3,
              1
            ]
          ],
          "expected": true
        },
        {
          "input": [
            [
              1,
              2,
              3,
              4
            ]
          ],
          "expected": false
        }
      ]
    }
  },
  {
    "id": "p-group-anagrams",
    "slug": "group-anagrams",
    "title": "Group Anagrams",
    "difficulty": "medium",
    "category": "Arrays & Hashing",
    "tags": [
      "array",
      "hash-map",
      "string",
      "sorting"
    ],
    "sourceUrl": "https://leetcode.com/problems/group-anagrams/",
    "description": "Given an array of strings, group together the ones that are anagrams of each other. Two strings are anagrams when one can be formed by rearranging the letters of the other. Return the groups in any order.",
    "examples": [
      {
        "input": "strs = [\"eat\",\"tea\",\"tan\",\"ate\",\"nat\",\"bat\"]",
        "output": "[[\"bat\"],[\"nat\",\"tan\"],[\"ate\",\"eat\",\"tea\"]]"
      },
      {
        "input": "strs = [\"\"]",
        "output": "[[\"\"]]"
      },
      {
        "input": "strs = [\"a\"]",
        "output": "[[\"a\"]]"
      }
    ],
    "constraints": "1 <= strs.length <= 10^4; 0 <= strs[i].length <= 100; strings contain lowercase English letters.",
    "supportedLanguages": [
      "javascript",
      "python",
      "java",
      "cpp"
    ],
    "starterCode": {
      "javascript": "function groupAnagrams(strs) {\n  // your code here\n}\n",
      "python": "def group_anagrams(strs):\n    # your code here\n    pass\n",
      "java": "class Solution {\n    public List<List<String>> groupAnagrams(String[] strs) {\n        // your code here\n    }\n}\n",
      "cpp": "class Solution {\npublic:\n    vector<vector<string>> groupAnagrams(vector<string>& strs) {\n        // your code here\n    }\n};\n"
    }
  },
  {
    "id": "p-valid-palindrome",
    "slug": "valid-palindrome",
    "title": "Valid Palindrome",
    "difficulty": "easy",
    "category": "Two Pointers",
    "tags": [
      "string",
      "two-pointers"
    ],
    "sourceUrl": "https://leetcode.com/problems/valid-palindrome/",
    "description": "A phrase is a palindrome if, after lowercasing and removing every non-alphanumeric character, it reads the same forwards and backwards. Given a string, return whether it is a palindrome under these rules.",
    "examples": [
      {
        "input": "s = \"A man, a plan, a canal: Panama\"",
        "output": "true",
        "explanation": "Normalises to \"amanaplanacanalpanama\"."
      },
      {
        "input": "s = \"race a car\"",
        "output": "false"
      }
    ],
    "constraints": "1 <= s.length <= 2 * 10^5; s contains printable ASCII characters.",
    "supportedLanguages": [
      "javascript",
      "python",
      "java",
      "cpp"
    ],
    "starterCode": {
      "javascript": "function isPalindrome(s) {\n  // your code here\n}\n",
      "python": "class Solution:\n    def isPalindrome(self, s):\n        # your code here\n        pass\n",
      "java": "import java.util.*;\n\nclass Solution {\n    public boolean isPalindrome(String s) {\n        // your code here\n        return false;\n    }\n}\n",
      "cpp": "#include <bits/stdc++.h>\nusing namespace std;\n\nclass Solution {\npublic:\n    bool isPalindrome(string s) {\n        // your code here\n        return false;\n    }\n};\n"
    },
    "harness": {
      "entry": "isPalindrome",
      "params": [
        {
          "name": "s",
          "type": "string"
        }
      ],
      "returns": "bool",
      "tests": [
        {
          "input": [
            "A man, a plan, a canal: Panama"
          ],
          "expected": true
        },
        {
          "input": [
            "race a car"
          ],
          "expected": false
        }
      ]
    }
  },
  {
    "id": "p-3sum",
    "slug": "3sum",
    "title": "3Sum",
    "difficulty": "medium",
    "category": "Two Pointers",
    "tags": [
      "array",
      "two-pointers",
      "sorting"
    ],
    "sourceUrl": "https://leetcode.com/problems/3sum/",
    "description": null,
    "examples": null,
    "constraints": null,
    "supportedLanguages": [
      "javascript",
      "python",
      "java",
      "cpp"
    ],
    "starterCode": {
      "javascript": "function threeSum(nums) {\n  // your code here\n}\n",
      "python": "def three_sum(nums):\n    # your code here\n    pass\n",
      "java": "class Solution {\n    public List<List<Integer>> threeSum(int[] nums) {\n        // your code here\n    }\n}\n",
      "cpp": "class Solution {\npublic:\n    vector<vector<int>> threeSum(vector<int>& nums) {\n        // your code here\n    }\n};\n"
    }
  },
  {
    "id": "p-best-time-to-buy-and-sell-stock",
    "slug": "best-time-to-buy-and-sell-stock",
    "title": "Best Time to Buy And Sell Stock",
    "difficulty": "easy",
    "category": "Sliding Window",
    "tags": [
      "array",
      "sliding-window",
      "dynamic-programming"
    ],
    "sourceUrl": "https://leetcode.com/problems/best-time-to-buy-and-sell-stock/",
    "description": "You are given an array where the i-th element is the price of a stock on day i. Choose one day to buy and a later day to sell. Return the maximum profit you can achieve, or 0 if no profit is possible.",
    "examples": [
      {
        "input": "prices = [7, 1, 5, 3, 6, 4]",
        "output": "5",
        "explanation": "Buy on day 2 (price 1), sell on day 5 (price 6)."
      },
      {
        "input": "prices = [7, 6, 4, 3, 1]",
        "output": "0",
        "explanation": "Prices only fall, so no profitable trade exists."
      }
    ],
    "constraints": "1 <= prices.length <= 10^5; 0 <= prices[i] <= 10^4.",
    "supportedLanguages": [
      "javascript",
      "python",
      "java",
      "cpp"
    ],
    "starterCode": {
      "javascript": "function maxProfit(prices) {\n  // your code here\n}\n",
      "python": "class Solution:\n    def maxProfit(self, prices):\n        # your code here\n        pass\n",
      "java": "import java.util.*;\n\nclass Solution {\n    public int maxProfit(int[] prices) {\n        // your code here\n        return 0;\n    }\n}\n",
      "cpp": "#include <bits/stdc++.h>\nusing namespace std;\n\nclass Solution {\npublic:\n    int maxProfit(vector<int>& prices) {\n        // your code here\n        return 0;\n    }\n};\n"
    },
    "harness": {
      "entry": "maxProfit",
      "params": [
        {
          "name": "prices",
          "type": "int[]"
        }
      ],
      "returns": "int",
      "tests": [
        {
          "input": [
            [
              7,
              1,
              5,
              3,
              6,
              4
            ]
          ],
          "expected": 5
        },
        {
          "input": [
            [
              7,
              6,
              4,
              3,
              1
            ]
          ],
          "expected": 0
        }
      ]
    }
  },
  {
    "id": "p-valid-parentheses",
    "slug": "valid-parentheses",
    "title": "Valid Parentheses",
    "difficulty": "easy",
    "category": "Stack",
    "tags": [
      "string",
      "stack"
    ],
    "sourceUrl": "https://leetcode.com/problems/valid-parentheses/",
    "description": "Given a string containing only the characters ()[]{}, decide whether every opening bracket is closed by the matching type in the correct order. An empty string is valid.",
    "examples": [
      {
        "input": "s = \"()[]{}\"",
        "output": "true"
      },
      {
        "input": "s = \"(]\"",
        "output": "false"
      },
      {
        "input": "s = \"([)]\"",
        "output": "false"
      }
    ],
    "constraints": "1 <= s.length <= 10^4; s consists only of the six bracket characters.",
    "supportedLanguages": [
      "javascript",
      "python",
      "java",
      "cpp"
    ],
    "starterCode": {
      "javascript": "function isValid(s) {\n  // your code here\n}\n",
      "python": "class Solution:\n    def isValid(self, s):\n        # your code here\n        pass\n",
      "java": "import java.util.*;\n\nclass Solution {\n    public boolean isValid(String s) {\n        // your code here\n        return false;\n    }\n}\n",
      "cpp": "#include <bits/stdc++.h>\nusing namespace std;\n\nclass Solution {\npublic:\n    bool isValid(string s) {\n        // your code here\n        return false;\n    }\n};\n"
    },
    "harness": {
      "entry": "isValid",
      "params": [
        {
          "name": "s",
          "type": "string"
        }
      ],
      "returns": "bool",
      "tests": [
        {
          "input": [
            "()[]{}"
          ],
          "expected": true
        },
        {
          "input": [
            "(]"
          ],
          "expected": false
        },
        {
          "input": [
            "([)]"
          ],
          "expected": false
        }
      ]
    }
  },
  {
    "id": "p-binary-search",
    "slug": "binary-search",
    "title": "Binary Search",
    "difficulty": "easy",
    "category": "Binary Search",
    "tags": [
      "array",
      "binary-search"
    ],
    "sourceUrl": "https://leetcode.com/problems/binary-search/",
    "description": "Given a sorted array of distinct integers and a target, return the index of the target if present, otherwise -1. Your algorithm must run in O(log n) time.",
    "examples": [
      {
        "input": "nums = [-1, 0, 3, 5, 9, 12], target = 9",
        "output": "4"
      },
      {
        "input": "nums = [-1, 0, 3, 5, 9, 12], target = 2",
        "output": "-1"
      }
    ],
    "constraints": "1 <= nums.length <= 10^4; nums is sorted ascending with distinct values.",
    "supportedLanguages": [
      "javascript",
      "python",
      "java",
      "cpp"
    ],
    "starterCode": {
      "javascript": "function search(nums, target) {\n  // your code here\n}\n",
      "python": "class Solution:\n    def search(self, nums, target):\n        # your code here\n        pass\n",
      "java": "import java.util.*;\n\nclass Solution {\n    public int search(int[] nums, int target) {\n        // your code here\n        return 0;\n    }\n}\n",
      "cpp": "#include <bits/stdc++.h>\nusing namespace std;\n\nclass Solution {\npublic:\n    int search(vector<int>& nums, int target) {\n        // your code here\n        return 0;\n    }\n};\n"
    },
    "harness": {
      "entry": "search",
      "params": [
        {
          "name": "nums",
          "type": "int[]"
        },
        {
          "name": "target",
          "type": "int"
        }
      ],
      "returns": "int",
      "tests": [
        {
          "input": [
            [
              -1,
              0,
              3,
              5,
              9,
              12
            ],
            9
          ],
          "expected": 4
        },
        {
          "input": [
            [
              -1,
              0,
              3,
              5,
              9,
              12
            ],
            2
          ],
          "expected": -1
        }
      ]
    }
  },
  {
    "id": "p-reverse-linked-list",
    "slug": "reverse-linked-list",
    "title": "Reverse Linked List",
    "difficulty": "easy",
    "category": "Linked List",
    "tags": [
      "linked-list",
      "recursion"
    ],
    "sourceUrl": "https://leetcode.com/problems/reverse-linked-list/",
    "description": "Given the head of a singly linked list, reverse the list and return the new head.",
    "examples": [
      {
        "input": "head = [1, 2, 3, 4, 5]",
        "output": "[5, 4, 3, 2, 1]"
      },
      {
        "input": "head = []",
        "output": "[]"
      }
    ],
    "constraints": "0 <= list length <= 5000; -5000 <= Node.val <= 5000.",
    "supportedLanguages": [
      "javascript",
      "python",
      "java",
      "cpp"
    ],
    "starterCode": {
      "javascript": "function reverseList(head) {\n  // your code here\n}\n",
      "python": "def reverse_list(head):\n    # your code here\n    pass\n",
      "java": "class Solution {\n    public ListNode reverseList(ListNode head) {\n        // your code here\n    }\n}\n",
      "cpp": "class Solution {\npublic:\n    ListNode* reverseList(ListNode* head) {\n        // your code here\n    }\n};\n"
    }
  },
  {
    "id": "p-invert-binary-tree",
    "slug": "invert-binary-tree",
    "title": "Invert Binary Tree",
    "difficulty": "easy",
    "category": "Trees",
    "tags": [
      "tree",
      "dfs",
      "bfs",
      "recursion"
    ],
    "sourceUrl": "https://leetcode.com/problems/invert-binary-tree/",
    "description": "Given the root of a binary tree, swap every node's left and right children (recursively) and return the root of the resulting mirrored tree.",
    "examples": [
      {
        "input": "root = [4, 2, 7, 1, 3, 6, 9]",
        "output": "[4, 7, 2, 9, 6, 3, 1]"
      },
      {
        "input": "root = []",
        "output": "[]"
      }
    ],
    "constraints": "0 <= node count <= 100; -100 <= Node.val <= 100.",
    "supportedLanguages": [
      "javascript",
      "python",
      "java",
      "cpp"
    ],
    "starterCode": {
      "javascript": "function invertTree(root) {\n  // your code here\n}\n",
      "python": "def invert_tree(root):\n    # your code here\n    pass\n",
      "java": "class Solution {\n    public TreeNode invertTree(TreeNode root) {\n        // your code here\n    }\n}\n",
      "cpp": "class Solution {\npublic:\n    TreeNode* invertTree(TreeNode* root) {\n        // your code here\n    }\n};\n"
    }
  },
  {
    "id": "p-climbing-stairs",
    "slug": "climbing-stairs",
    "title": "Climbing Stairs",
    "difficulty": "easy",
    "category": "1-D Dynamic Programming",
    "tags": [
      "dynamic-programming",
      "math"
    ],
    "sourceUrl": "https://leetcode.com/problems/climbing-stairs/",
    "description": "You are climbing a staircase with n steps. Each move you may climb either 1 or 2 steps. Return the number of distinct ways to reach the top.",
    "examples": [
      {
        "input": "n = 2",
        "output": "2",
        "explanation": "1+1 or 2."
      },
      {
        "input": "n = 3",
        "output": "3",
        "explanation": "1+1+1, 1+2, or 2+1."
      }
    ],
    "constraints": "1 <= n <= 45.",
    "supportedLanguages": [
      "javascript",
      "python",
      "java",
      "cpp"
    ],
    "starterCode": {
      "javascript": "function climbStairs(n) {\n  // your code here\n}\n",
      "python": "class Solution:\n    def climbStairs(self, n):\n        # your code here\n        pass\n",
      "java": "import java.util.*;\n\nclass Solution {\n    public int climbStairs(int n) {\n        // your code here\n        return 0;\n    }\n}\n",
      "cpp": "#include <bits/stdc++.h>\nusing namespace std;\n\nclass Solution {\npublic:\n    int climbStairs(int n) {\n        // your code here\n        return 0;\n    }\n};\n"
    },
    "harness": {
      "entry": "climbStairs",
      "params": [
        {
          "name": "n",
          "type": "int"
        }
      ],
      "returns": "int",
      "tests": [
        {
          "input": [
            2
          ],
          "expected": 2
        },
        {
          "input": [
            3
          ],
          "expected": 3
        }
      ]
    }
  }
]
