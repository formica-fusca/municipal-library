import { CopyId, Money, TitleId } from '@local/shared-kernel'
import { broke, expectRefusal, good, note, section, step, title } from './narrate.js'
import { buildLibrary, seedLibrary } from '@local/composition'

/**
 * Scenario 4 — every rule in the model, attacked on purpose.
 *
 * The first half shows invariants doing their job. The last section does the
 * opposite: it reaches past an aggregate boundary and breaks the invariant for
 * real, so you can see what the boundary was buying.
 */
export async function run(): Promise<void> {
  title('Scenario 4 · Invariants under attack')

  const library = buildLibrary()
  const { dune, alice, chloe } = await seedLibrary(library)

  // ───────────────────────────────────────────────────────────────────────────
  section('Value objects — invalid states are unconstructable')

  await expectRefusal('an ISBN whose check digit does not add up', () =>
    library.registerTitle.execute({
      titleId: 'TITLE-BAD',
      isbn: '9780441013591',
      heading: 'Nope',
      author: 'Nobody',
      publishedYear: 2020,
    }),
  )

  await expectRefusal('a negative amount of money', () => Money.cents(-500))
  await expectRefusal('a fractional number of cents', () => Money.cents(12.5))
  await expectRefusal('multiplying money by a negative quantity', () =>
    Money.euros(10).times(-1),
  )
  await expectRefusal('a title published before the printing press', () =>
    library.registerTitle.execute({
      titleId: 'TITLE-ANCIENT',
      isbn: '9780140449136',
      heading: 'Something Very Old',
      author: 'Anon',
      publishedYear: 800,
    }),
  )

  note('')
  note('  None of these needed a repository, a mock, or a running system. An')
  note('  invariant enforced in a constructor is enforced everywhere, forever,')
  note('  for free.')

  // ───────────────────────────────────────────────────────────────────────────
  section('Entity invariants — the copy lifecycle is a state machine')

  await expectRefusal('shelving a barcode that is already in stock', () =>
    library.acquireCopy.execute({ titleId: dune.value, barcode: 'LIB-000101' }),
  )

  await expectRefusal('declaring a copy lost while it sits on the shelf', () =>
    library.shelf.reportLost(dune, CopyId.of('LIB-000101')),
  )
  note('      Available → Lost is not an edge in LEGAL_TRANSITIONS. A volume can')
  note('      only be lost while somebody has it; found on the shelf, it is not')
  note('      lost — it is there.')

  await expectRefusal('repairing a copy that is not damaged', () =>
    library.shelf.repair(dune, CopyId.of('LIB-000102')),
  )

  await expectRefusal('returning a copy the library never owned', () =>
    library.shelf.acceptReturn(dune, CopyId.of('LIB-999999')),
  )

  // ───────────────────────────────────────────────────────────────────────────
  section('Aggregate invariants — the count and the shelf agree')

  const stock = await library.stocks.findById(dune)
  if (stock === undefined) {
    broke('expected stock to exist')
    return
  }
  good(`${stock.availableCount} available of ${stock.totalCopies} — consistent`)

  // ───────────────────────────────────────────────────────────────────────────
  section('Queue invariants')

  await library.holdDesk.placeHold({ titleId: dune, memberId: alice })
  await expectRefusal('the same member taking two places in one queue', () =>
    library.holdDesk.placeHold({ titleId: dune, memberId: alice }),
  )
  await library.holdDesk.cancelHold({ titleId: dune, memberId: alice })

  await expectRefusal('collecting a hold that was never allocated', () =>
    library.holdDesk.collect({ titleId: dune, memberId: alice }),
  )

  // ───────────────────────────────────────────────────────────────────────────
  section('Refusals that are NOT invariant violations')

  await library.membershipDesk.suspend(
    alice,
    'unreturned volumes from last winter',
    new Date('2026-05-01T00:00:00Z'),
  )
  const suspended = await library.borrowBook.execute({ memberId: alice, titleId: dune })
  step(
    suspended.kind === 'refused'
      ? `Alice refused — ${suspended.reason}`
      : `unexpected outcome: ${suspended.kind}`,
  )

  note('')
  note('  Nothing in the model is inconsistent here; the library simply said no.')
  note('  `DomainError` and `InvariantViolation` are separate types for exactly')
  note('  this reason: one prints a message at the counter, the other means the')
  note('  model has a bug and somebody should be paged. Give them the same type')
  note('  and one day they will be handled the same way.')

  // ───────────────────────────────────────────────────────────────────────────
  section('A limit that deliberately is not an invariant')

  const chloeMember = await library.members.findById(chloe)
  note(`  Chloé is a ${chloeMember?.tier} member — allowance ${chloeMember?.allowance}.`)

  const extraTitles = [
    { id: 'TITLE-LOTR', isbn: '9780261102385', heading: 'The Lord of the Rings' },
    { id: 'TITLE-FOUNDATION', isbn: '9780553293357', heading: 'Foundation' },
    { id: 'TITLE-NEUROMANCER', isbn: '9780441569595', heading: 'Neuromancer' },
  ]

  for (const [index, entry] of extraTitles.entries()) {
    await library.registerTitle.execute({
      titleId: entry.id,
      isbn: entry.isbn,
      heading: entry.heading,
      author: 'Various',
      publishedYear: 1954 + index,
    })
    await library.acquireCopy.execute({ titleId: entry.id, barcode: `LIB-0004${index}0` })

    const outcome = await library.borrowBook.execute({
      memberId: chloe,
      titleId: TitleId.of(entry.id),
    })
    step(`Chloé borrows "${entry.heading}": ${outcome.kind}`)
  }

  const fourth = await library.borrowBook.execute({ memberId: chloe, titleId: dune })
  step(
    fourth.kind === 'refused'
      ? `a fourth title is refused — ${fourth.reason}`
      : `unexpected outcome: ${fourth.kind}`,
  )

  note('')
  note('  `Member.assertInvariants()` does not check this limit. The rule spans')
  note('  Member and every Loan, so no single aggregate can guarantee it — it is')
  note('  checked at decision time, and the counter is repaired afterwards by a')
  note('  handler on `lending.loan-opened`.')

  // ───────────────────────────────────────────────────────────────────────────
  section('⚠️  Now we break an aggregate on purpose')

  note('  Everything above respected the boundary. `unsafeCopyForTeaching()`')
  note('  hands out a live Copy entity — precisely what an aggregate exists to')
  note('  prevent. Watch a caller mutate a child without the root noticing.')
  note('')

  step(`before: the root reports availableCount = ${stock.availableCount}`)

  const leaked = stock.unsafeCopyForTeaching(CopyId.of('LIB-000101'))
  leaked.reportDamaged('a caller reached past the root', library.clock.now())

  step(`the Copy now reports status = ${leaked.status}`)
  step(`the root still reports availableCount = ${stock.availableCount}  ← they disagree`)

  await expectRefusal('the aggregate checking its own invariant', () => {
    stock.assertInvariants()
  })

  await expectRefusal('the repository refusing to persist an inconsistent aggregate', () =>
    library.stocks.save(stock),
  )

  note('')
  note('  That is the entire argument for aggregate boundaries, in six lines.')
  note('  "availableCount equals the copies on the shelf" cannot be kept by a')
  note('  Copy (it cannot see the others), nor by the caller (it does not own')
  note('  the counter). Only the object owning both can keep it — which is why')
  note('  nothing outside may hold a Copy, and why `Copy` is not exported from')
  note('  @local/library-inventory at all.')
  note('')
  note('  Note where it was caught: InMemoryRepository.save() calls')
  note('  assertInvariants() before storing, so nothing inconsistent reaches')
  note('  storage even when a caller misbehaves.')

  // ───────────────────────────────────────────────────────────────────────────
  section('One class of error that cannot be demonstrated at runtime')

  note('  Type this into your editor and watch it fail to compile:')
  note('')
  note('      library.borrowBook.execute({ memberId: dune, titleId: alice })')
  note('')
  note('  TitleId and MemberId are both a string in a wrapper, but each declares')
  note('  a distinct `_tag`, which makes them mutually unassignable. Because the')
  note('  field uses `declare`, that safety costs exactly zero bytes of emitted')
  note('  JavaScript — the cheapest invariant in the repository.')
}

await run()
