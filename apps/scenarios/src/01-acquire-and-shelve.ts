import { Isbn } from '@local/shared-kernel'
import { events, expectRefusal, good, note, section, step, title } from './narrate.js'
import { buildLibrary } from '@local/composition'

/**
 * Scenario 1 — a title is catalogued and volumes reach the shelves.
 *
 * Concepts on show: Value Object validation, the named constructor, and the
 * difference between an event that fires per change and an event that fires
 * on an *edge*.
 */
export async function run(): Promise<void> {
  title('Scenario 1 · Cataloguing a title and shelving its copies')

  const library = buildLibrary()

  section('A Value Object refuses to exist in an invalid state')
  note('  Isbn.of() validates the ISBN-13 checksum in its constructor. Because')
  note('  the constructor is private, no Isbn anywhere in the system can be')
  note('  invalid — every function downstream gets that for free.')

  await expectRefusal('registering "Dune" with a mistyped ISBN', () =>
    library.registerTitle.execute({
      titleId: 'TITLE-DUNE',
      isbn: '9780441013594', // last digit wrong
      heading: 'Dune',
      author: 'Frank Herbert',
      publishedYear: 1965,
    }),
  )

  good(`a correct one parses: ${Isbn.of('9780441013593').format()}`)

  section('Registering the title')
  const dune = await library.registerTitle.execute({
    titleId: 'TITLE-DUNE',
    isbn: '9780441013593',
    heading: 'Dune',
    author: 'Frank Herbert',
    publishedYear: 1965,
  })
  good(`catalogued as ${dune.value}`)
  events(library.log.names().map(String))

  section('Three physical volumes arrive from the supplier')
  library.log.clear()

  for (const barcode of ['LIB-000101', 'LIB-000102', 'LIB-000103']) {
    await library.acquireCopy.execute({ titleId: dune.value, barcode })
    step(`shelved ${barcode}`)
  }

  const stock = await library.stocks.findById(dune)
  good(`stock now holds ${stock?.totalCopies} copies, ${stock?.availableCount} available`)

  section('What was published')
  events(library.log.events.map((event) => event.describe()))

  note('')
  note('  Notice: three copies arrived, but `inventory.title-became-available`')
  note('  fired exactly ONCE — on the first one.')
  note('')
  note('  BookStock announces the *edge* (nothing on the shelf → something on')
  note('  the shelf), not every change to the number. Going from one copy to')
  note('  two is nobody else’s business, and publishing it would invite')
  note('  subscribers to make decisions from a count they cannot trust to')
  note('  still be current by the time they read it.')
  note('')
  note('  Choosing which facts are worth announcing is a modelling decision,')
  note('  not a technical one.')

  section('Two aggregates, two contexts, one identity')
  note('  The catalogue record and the shelf stock are separate aggregates in')
  note('  separate packages. They share only `TitleId`. Catalogue knows the')
  note('  author; Inventory has never heard of one.')
  note(`  Catalogue: ${(await library.titles.findById(dune))?.describe()}`)
  note(`  Inventory: ${stock?.totalCopies} volumes, barcodes ${stock
    ?.snapshot()
    .copies.map((copy) => copy.copyId)
    .join(', ')}`)
}

await run()
