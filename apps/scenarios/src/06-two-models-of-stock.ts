import { CopyId } from '@local/shared-kernel'
import { events, expectRefusal, good, note, section, step, title } from './narrate.js'
import { buildLibrary, seedLibrary } from '@local/composition'

/**
 * Scenario 6 — the same word, "stock", modelled two completely different ways.
 *
 * This is the argument for bounded contexts, made concrete. Neither model is a
 * simplification of the other; each is the right model for the questions its
 * side of the building has to answer.
 */
export async function run(): Promise<void> {
  title('Scenario 6 · Two models of the word "stock"')

  const library = buildLibrary()
  const { dune } = await seedLibrary(library)

  // ───────────────────────────────────────────────────────────────────────────
  section('The library: stock is a set of identified volumes')

  const stock = await library.stocks.findById(dune)
  step('barcodes on the shelf:')
  for (const copy of stock?.snapshot().copies ?? []) {
    console.log(`      ${copy.copyId} — ${copy.status}, lent ${copy.timesLent}×`)
  }

  library.log.clear()
  await library.shelf.reportDamaged(dune, CopyId.of('LIB-000102'), 'coffee ring on page 40')
  events(library.log.events.map((event) => event.describe()))

  good('the library can answer: “which volume is damaged?” → LIB-000102')
  note('  It has to be able to. Overdue notices name a volume; the hold shelf')
  note('  holds a volume; a damage charge is levied on a volume. Reduce this to')
  note('  a counter and the business becomes inexpressible.')

  // ───────────────────────────────────────────────────────────────────────────
  section('The shop annex: stock is a number')

  const paperback = await library.shop.list({
    productId: 'SHOP-DUNE-PB',
    isbn: '9780441013593',
    priceEuros: 9.9,
  })

  await library.shop.receiveDelivery(paperback, 4)
  library.log.clear()

  await library.shop.reserveForCollection(paperback, 1, 'phone order — Mme Rossi')
  const takings = await library.shop.sellOverTheCounter(paperback, 2)

  const item = await library.shop.inspect(paperback)
  step(
    `on hand ${item.onHand}, reserved ${item.reserved}, sellable ${item.sellable}, took ${takings.format()}`,
  )
  events(library.log.events.map((event) => event.describe()))

  good('the shop CANNOT answer “which copy did we sell?” — and never needs to')
  note('  A customer buying Dune does not care which of the four boxed copies')
  note('  they get. The units are fungible, so the honest model is a number.')
  note('  Inventing a ShopCopy entity would create identity that means nothing,')
  note('  a lifecycle nobody observes, and a table that grows with sales for no')
  note('  benefit whatsoever.')

  // ───────────────────────────────────────────────────────────────────────────
  section('Both have invariants; only one needs a cluster to protect them')

  note('  Library — “availableCount equals the copies on the shelf”')
  note('            spans the root and every child → the children live inside')
  note('            the boundary, and Copy is not exported from its package.')
  note('')
  note('  Shop    — “reserved never exceeds on hand”')
  note('            two fields of one object → no children needed at all.')
  note('')
  note('  StockItem never overrides childEntities(). Having an invariant does')
  note('  not imply having a cluster.')

  await expectRefusal('promising more copies than the shop holds', () =>
    library.shop.reserveForCollection(paperback, 99, 'optimistic customer'),
  )

  await expectRefusal('selling stock that is reserved for someone else', async () => {
    const remaining = await library.shop.inspect(paperback)
    await library.shop.sellOverTheCounter(paperback, remaining.onHand)
  })

  // ───────────────────────────────────────────────────────────────────────────
  section('The comparison, side by side')

  const rows: readonly (readonly [string, string, string])[] = [
    ['stock is', 'a set of Copy entities', 'two integers'],
    ['child entities', 'one per physical volume', 'none'],
    ['“which one?”', 'has an answer', 'is a meaningless question'],
    ['lifecycle', 'lent, damaged, repaired, lost', 'none — units interchangeable'],
    ['aggregate id', 'TitleId', 'ProductId'],
    ['invariant', 'count matches the shelf', 'reserved ≤ on hand'],
  ]

  const pad = (text: string, width: number): string => text.padEnd(width)
  console.log(`\n    ${pad('', 16)}${pad('LIBRARY', 32)}SHOP`)
  console.log(`    ${'─'.repeat(16)}${'─'.repeat(32)}${'─'.repeat(30)}`)
  for (const [label, lib, shop] of rows) {
    console.log(`    ${pad(label, 16)}${pad(lib, 32)}${shop}`)
  }

  section('What connects them')
  note('  Exactly one thing: the ISBN. Both contexts agree on which *work* they')
  note('  are talking about, and agree on nothing else. That shared vocabulary')
  note('  is the shared kernel — and its being this small is the whole point.')
  note('')
  note(`  library title  → ${(await library.titles.findById(dune))?.isbn.format()}`)
  note(`  shop product   → ${item.isbn.format()}`)

  note('')
  note('  The lesson: identity is not a property of the *thing*. It is a')
  note('  property of what your business needs to say about the thing. The same')
  note('  book on the same shelf is an Entity on one side of the building and')
  note('  an anonymous unit on the other — and both models are correct.')
}

await run()
