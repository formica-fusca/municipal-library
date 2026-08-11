/* Console formatting for the scenario transcripts. No domain content here. */

import type { DomainEvent } from '@local/ddd-core'

const BOLD = '[1m'
const DIM = '[2m'
const CYAN = '[36m'
const GREEN = '[32m'
const RED = '[31m'
const YELLOW = '[33m'
const RESET = '[0m'

export const title = (text: string): void => {
  const rule = '═'.repeat(Math.max(text.length, 20))
  console.log(`\n${BOLD}${CYAN}${text}${RESET}\n${CYAN}${rule}${RESET}`)
}

export const section = (text: string): void => {
  console.log(`\n${BOLD}${text}${RESET}`)
}

export const note = (text: string): void => {
  console.log(`${DIM}${text}${RESET}`)
}

export const step = (text: string): void => {
  console.log(`  • ${text}`)
}

export const good = (text: string): void => {
  console.log(`  ${GREEN}✓${RESET} ${text}`)
}

export const refused = (text: string): void => {
  console.log(`  ${YELLOW}✗${RESET} ${text}`)
}

export const broke = (text: string): void => {
  console.log(`  ${RED}💥${RESET} ${text}`)
}

export const events = (lines: readonly string[]): void => {
  if (lines.length === 0) {
    console.log(`    ${DIM}(no events published)${RESET}`)
    return
  }
  for (const line of lines) {
    console.log(`    ${DIM}→ ${line}${RESET}`)
  }
}

/**
 * The console adapter for `LibraryOptions.onEvent`.
 *
 * `buildLibrary({ onEvent: traceEvent })` does what `traceEvents: true` used to
 * do before the composition root became a package. It lives here rather than
 * there because an ANSI escape code is a fact about terminals:
 * `composition` compiles with `"types": []` and could not write this
 * function even if it wanted to.
 */
export const traceEvent = (event: DomainEvent): void => {
  console.log(`      ${DIM}⚡ ${event.describe()}${RESET}`)
}

/**
 * Run something that is expected to be refused, and report which rule refused
 * it. Used throughout scenario 04.
 */
export const expectRefusal = async (
  what: string,
  action: () => unknown | Promise<unknown>,
): Promise<void> => {
  try {
    await action()
    broke(`${what} — but nothing stopped it. That is a bug in the model.`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    refused(`${what}\n      ${DIM}${message}${RESET}`)
  }
}
