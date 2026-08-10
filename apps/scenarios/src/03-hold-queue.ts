import { events, good, note, refused, section, step, title } from './narrate.js'
import { buildLibrary, seedLibrary } from '@local/composition'

/**
 * Scenario 3 — the reservation queue, driven entirely by events and the clock.
 *
 * Concepts on show: a second aggregate root with child entities, ordering as an
 * invariant, an injected domain policy, and a use case triggered by a domain
 * event from another bounded context.
 */
export async function run(): Promise<void> {
  title('Scenario 3 · The hold queue')

  const library = buildLibrary()
  const { dune, alice, bruno, chloe } = await seedLibrary(library)

  const denis = await library.membershipDesk.enrol({
    memberId: 'CARD-0004',
    name: 'Denis',
    tier: 'Adult',
  })
  const elena = await library.membershipDesk.enrol({
    memberId: 'CARD-0005',
    name: 'Elena',
    tier: 'Adult',
  })

  section('All three copies go out')
  for (const [name, member] of [
    ['Alice', alice],
    ['Bruno', bruno],
    ['Chloé', chloe],
  ] as const) {
    const outcome = await library.borrowBook.execute({ memberId: member, titleId: dune })
    step(`${name}: ${outcome.kind}${outcome.kind === 'lent' ? ` (${outcome.copyId.value})` : ''}`)
  }

  const stock = await library.stocks.findById(dune)
  good(`shelf is now empty: ${stock?.availableCount} available`)

  section('Denis asks for a copy')
  library.log.clear()
  const denisAttempt = await library.borrowBook.execute({ memberId: denis, titleId: dune })
  refused(`Denis: ${denisAttempt.kind}`)

  note('')
  note('  `no-copy-available` is returned, not thrown. It is one of three normal')
  note('  answers, and the caller has something useful to do with it — offer a')
  note('  hold. Exceptions are kept for genuine faults so the distinction keeps')
  note('  meaning something.')

  const denisPosition = await library.holdDesk.placeHold({ titleId: dune, memberId: denis })
  good(`Denis is #${denisPosition} in the queue`)

  const elenaPosition = await library.holdDesk.placeHold({ titleId: dune, memberId: elena })
  good(`Elena is #${elenaPosition} in the queue`)
  events(library.log.events.map((event) => event.describe()))

  section('Alice returns her copy — and the library reacts on its own')
  library.log.clear()

  const aliceLoan = (await library.loans.findOpenLoansForMember(alice))[0]
  if (aliceLoan === undefined) {
    refused('expected Alice to have an open loan')
    return
  }

  await library.returnBook.execute({ copyId: aliceLoan.copyId })
  events(library.log.events.map((event) => event.describe()))

  note('')
  note('  Follow the chain, and notice that no single file contains it:')
  note('')
  note('    ReturnBook  →  shelf.acceptReturn()')
  note('    Inventory   →  raises `title-became-available` (an edge, not a count)')
  note('    composition →  a subscriber calls HoldDesk.allocateOnAvailability()')
  note('    Lending     →  HoldQueue picks the front of the queue: Denis')
  note('')
  note('  Inventory does not import Lending. Lending does not import Inventory.')
  note('  Each end knows only the event.')

  const queue = await library.holdDesk.queueFor(dune)
  good(`allocated: ${queue?.allocatedCount}, still waiting: ${queue?.waitingCount}`)

  section('Elena tries to walk in and take the copy anyway')
  const jumpAttempt = await library.borrowBook.execute({ memberId: elena, titleId: dune })
  refused(
    jumpAttempt.kind === 'refused' ? jumpAttempt.reason : `unexpected: ${jumpAttempt.kind}`,
  )

  note('')
  note('  This rule lives in BorrowBook, not in either aggregate — it spans the')
  note('  queue and the stock, and neither can see the other. It is *checked*,')
  note('  not guaranteed: an allocation could land between the read and the')
  note('  write. That race is named and accepted in the code, because the')
  note('  alternative is locking the queue on every borrow in the building.')

  section('Denis never turns up. Three days pass.')
  library.log.clear()
  library.clock.advanceDays(3)

  const sweep = await library.holdDesk.expireLapsedHolds()
  good(`${sweep.expired} hold(s) lapsed; reallocated to ${sweep.reallocatedTo.length} member(s)`)
  events(library.log.events.map((event) => event.describe()))

  note('')
  note('  `lending.hold-expired` was recorded by the **HoldRequest child**, and')
  note('  `lending.hold-allocated` by the **HoldQueue root**. The rule behind')
  note('  that split: a child records what only it knows (its own collect-by')
  note('  date passed); the root records what needs the whole cluster in view')
  note('  (being chosen ahead of everyone else).')

  section('Elena collects')
  library.log.clear()
  const collected = await library.holdDesk.collect({ titleId: dune, memberId: elena })
  good(`loan ${collected.loanId.value}, due ${collected.dueAt.toISOString().slice(0, 10)}`)
  events(library.log.events.map((event) => event.describe()))

  section('Final queue')
  const finalQueue = await library.holdDesk.queueFor(dune)
  for (const request of finalQueue?.snapshot().requests ?? []) {
    step(`${request.memberId} — ${request.status}`)
  }

  section('Ordering is itself an invariant')
  note('  HoldQueue.assertInvariants() checks three rules, and only one of them')
  note('  is about a number:')
  note('    1. a member holds at most one place in a queue')
  note('    2. a collect-by date exists exactly for allocated holds')
  note('    3. entries are ordered by request time')
  note('')
  note('  Rule 3 is worth dwelling on. If the entries stopped being sorted,')
  note('  nothing would crash and no count would disagree — "third in the')
  note('  queue" would simply start lying. Invariants are not only arithmetic.')

  section('Who was told what')
  for (const message of library.notifications) step(message)

  note('')
  note(`  Allocation used the policy: "strict first-in-first-out".`)
  note('  It is injected, not hard-coded — see HoldAllocationPolicy, and the')
  note('  👉 YOUR CALL block above StrictFifoAllocation.')
}

await run()
