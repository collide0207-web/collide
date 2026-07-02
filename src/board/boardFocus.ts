import type { Editor } from 'tldraw'

/**
 * Keyboard focus coordinator for the whiteboard.
 *
 * tldraw only processes its keyboard shortcuts (v, r, Delete, Cmd+Z, arrows, …)
 * when its editor is "focused" (instanceState.isFocused). We manage that flag
 * explicitly so keystrokes NEVER leak between the code editor and the board:
 *   - focusBoard(): called when the user clicks the board  → board handles keys
 *   - blurBoard():  called when Monaco gains focus          → board ignores keys
 */
let current: Editor | null = null

export function registerBoard(editor: Editor | null) {
  current = editor
}

export function focusBoard() {
  current?.updateInstanceState({ isFocused: true })
}

export function blurBoard() {
  current?.updateInstanceState({ isFocused: false })
}
