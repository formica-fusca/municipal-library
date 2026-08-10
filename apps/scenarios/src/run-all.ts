/**
 * Runs every scenario in order.
 *
 * Dynamic imports, because each scenario module runs itself on import. That
 * keeps `tsx apps/scenarios/src/03-hold-queue.ts` working as a standalone
 * command — the ordinary way you will want to run one while reading it.
 */
const scenarios = [
  './01-acquire-and-shelve.js',
  './02-borrow-and-return.js',
  './03-hold-queue.js',
  './04-invariants-under-attack.js',
  './05-can-an-entity-emit-an-event.js',
  './06-two-models-of-stock.js',
] as const

for (const scenario of scenarios) {
  await import(scenario)
}

console.log('\n[2mAll six scenarios complete. See docs/ for the concepts in prose.[0m\n')
