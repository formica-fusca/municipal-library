import { CopyId } from '@local/shared-kernel'
import { events, good, note, refused, section, step, title } from './narrate.js'
import { buildLibrary, seedLibrary } from '@local/composition'

/**
 * Scenario 2 — the ordinary life of a loan.
 *
 * Concepts on show: one aggregate changed per transaction, a counter kept in
 * step by an event rather than by a foreign key, a time-driven use case, and a
 * child entity recording an event about itself.
 */
export async function run(): Promise<void> {
  title('Scenario 2 · Borrowing, falling overdue, returning, and damage')

  const library = buildLibrary()
  const { dune, alice } = await seedLibrary(library)

  section('Alice borrows a copy')
  const outcome = await library.borrowBook.execute({ memberId: alice, titleId: dune })

  if (outcome.kind !== 'lent') {
    refused(`unexpected outcome: ${outcome.kind}`)
    return
  }

  good(`lent copy ${outcome.copyId.value}, due ${outcome.dueAt.toISOString().slice(0, 10)}`)
  events(library.log.events.map((event) => event.describe()))

  note('')
  note('  Read that event list carefully. `BorrowBook` modified exactly ONE')
  note('  aggregate: the new Loan. The stock changed in Inventory’s own')
  note('  transaction behind a port, and Alice’s loan counter was not touched')
  note('  by the use case at all — a subscriber on `lending.loan-opened` did it.')

  const aliceNow = await library.members.findById(alice)
  good(`Alice’s counter is now ${aliceNow?.activeLoans} of ${aliceNow?.allowance}`)

  note('')
  note('  That counter is EVENTUALLY consistent. For a brief moment the loan')
  note('  existed and the counter did not know. This is why "at most 8 loans"')
  note('  is a policy checked at decision time, not an invariant of Member.')

  // ── Time passes ───────────────────────────────────────────────────────────
  section('Three weeks and change go by')
  library.log.clear()
  library.clock.advanceDays(25)
  step(`the clock now reads ${library.clock.now().toISOString().slice(0, 10)}`)

  const announced = await library.overdueSweep.run()
  good(`the nightly sweep announced ${announced} overdue loan(s)`)
  events(library.log.events.map((event) => event.describe()))

  note('')
  note('  Nobody requested this. The calendar did. `OverdueSweep` is a')
  note('  time-driven use case, and `Loan.announceOverdue()` is idempotent —')
  note('  run the sweep twice tonight and Alice still gets one notice.')

  library.log.clear()
  await library.overdueSweep.run()
  good(`running the sweep again published ${library.log.events.length} event(s)`)

  // ── The return ────────────────────────────────────────────────────────────
  section('Alice brings the volume back')
  library.log.clear()
  await library.returnBook.execute({ copyId: outcome.copyId })
  events(library.log.events.map((event) => event.describe()))

  const aliceAfter = await library.members.findById(alice)
  good(`Alice’s counter is back to ${aliceAfter?.activeLoans}`)

  // ── Damage: a child entity speaks ─────────────────────────────────────────
  section('The librarian notices a torn spine')
  library.log.clear()
  await library.shelf.reportDamaged(dune, outcome.copyId, 'water damage to the first signature')
  events(library.log.events.map((event) => event.describe()))

  note('')
  note('  `inventory.copy-damaged` was recorded by the **Copy entity**, not by')
  note('  the BookStock root. The copy is the only object that knows its own')
  note('  condition; the root only knows what that condition implies for the')
  note('  count. Both events left together, through the root, in causal order.')
  note('')
  note('  Scenario 5 takes this apart properly.')

  const stock = await library.stocks.findById(dune)
  const snapshot = stock?.snapshot()
  good(
    `stock: ${snapshot?.availableCount} available of ${snapshot?.totalCopies} — ` +
      (snapshot?.copies ?? [])
        .map((copy) => `${copy.copyId}:${copy.status}`)
        .join(', '),
  )

  section('The state machine refuses nonsense')
  note('  A damaged volume cannot simply be lent out again. `Copy` enforces its')
  note('  own lifecycle, which is a rule it can check entirely on its own —')
  note('  which is exactly why it belongs on the entity and not on the root.')

  const damaged = CopyId.of(outcome.copyId.value)
  step(`${damaged.value} is ${stock?.statusOf(damaged)}; it must be repaired before it counts again`)

  await library.shelf.repair(dune, damaged)
  const repaired = await library.stocks.findById(dune)
  good(`after repair: ${repaired?.availableCount} available`)

  section('Notifications the members would have received')
  for (const message of library.notifications) step(message)
}

await run()
