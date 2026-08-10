import { AggregateRoot, DomainEvent, Entity, Identifier } from '@local/ddd-core'
import { CopyId } from '@local/shared-kernel'
import { broke, good, note, refused, section, step, title } from './narrate.js'
import { buildLibrary } from '@local/composition'

/**
 * Scenario 5 — the question this repository was built to answer.
 *
 *     "Can an entity emit a domain event, or must it come from the aggregate
 *      root?"
 *
 * The answer has two halves that are usually conflated, and separating them
 * dissolves most of the argument.
 */
export async function run(): Promise<void> {
  title('Scenario 5 · Can an entity emit a domain event?')

  note('  The question conflates two different verbs. Separate them and the')
  note('  disagreement mostly evaporates:')
  note('')
  note('    RECORD  — state that something happened to me.')
  note('    PUBLISH — put that statement on the bus, where the rest of the')
  note('              system will act on it.')
  note('')
  note('  In this codebase a child entity may RECORD. Only the aggregate root')
  note('  can cause anything to be PUBLISHED — and it does so only after the')
  note('  change has been committed.')

  // ───────────────────────────────────────────────────────────────────────────
  section('Part 1 · A child entity records; the root publishes')

  const library = buildLibrary()
  const dune = await library.registerTitle.execute({
    titleId: 'TITLE-DUNE',
    isbn: '9780441013593',
    heading: 'Dune',
    author: 'Frank Herbert',
    publishedYear: 1965,
  })
  await library.acquireCopy.execute({ titleId: dune.value, barcode: 'LIB-000101' })
  library.log.clear()

  note('  One title, one copy. We report that copy damaged. Two different')
  note('  objects have something to say about that:')
  note('')
  note('    the Copy   knows its spine is torn        (only it can know this)')
  note('    the Stock  knows the shelf is now empty   (only it can know this)')

  await library.shelf.reportDamaged(dune, CopyId.of('LIB-000101'), 'torn spine')

  step('published, in order:')
  for (const event of library.log.events) {
    console.log(`      #${event.sequence}  ${event.name}`)
  }

  note('')
  note('  Both arrived, and `copy-damaged` came first. That ordering is not')
  note('  luck. AggregateRoot.pullDomainEvents() drains its own buffer *and*')
  note('  every child’s, then sorts by a sequence number stamped when each')
  note('  event was constructed. Without that sort, every root event would')
  note('  appear before every child event, and the transcript would claim the')
  note('  shelf emptied before the copy was damaged.')

  // ───────────────────────────────────────────────────────────────────────────
  section('Part 2 · What actually stops a child from publishing')

  note('  Nothing in the type system, as it turns out. `record()` is protected,')
  note('  so any entity can call it. The constraint is structural: a child’s')
  note('  buffer is only ever drained by its root, and the root only drains it')
  note('  when the *root* is committed.')
  note('')
  note('  Forget to declare a child and its events go nowhere. Silently. Here')
  note('  are two otherwise identical aggregates:')

  const forgetful = new ForgetfulCrate(CrateId.of('CRATE-1'))
  forgetful.add(BottleId.of('BOTTLE-A'))
  forgetful.crack(BottleId.of('BOTTLE-A'))

  const attentive = new AttentiveCrate(CrateId.of('CRATE-2'))
  attentive.add(BottleId.of('BOTTLE-B'))
  attentive.crack(BottleId.of('BOTTLE-B'))

  const lost = forgetful.pullDomainEvents()
  const kept = attentive.pullDomainEvents()

  if (lost.length === 0) {
    broke(`ForgetfulCrate — does NOT override childEntities() → ${lost.length} events published`)
    refused('the bottle recorded `demo.bottle-cracked`. Nobody will ever hear it.')
  }

  good(
    `AttentiveCrate — overrides childEntities() → ${kept.length} event(s): ${kept
      .map((event) => event.name)
      .join(', ')}`,
  )

  note('')
  note('  The two classes differ by four lines. One of them loses domain events')
  note('  for as long as the code lives, and no test that only asserts on state')
  note('  will ever notice. This is a real failure mode, not a hypothetical —')
  note('  which is why `childEntities()` is documented as the thing that lets')
  note('  events escape, rather than as a piece of plumbing.')

  // ───────────────────────────────────────────────────────────────────────────
  section('Part 3 · Publishing happens after the write, never before')

  note('  UnitOfWork.commit() is four lines and the order of them is the point:')
  note('')
  note('      aggregate.assertInvariants()   ← refuse to write nonsense')
  note('      await repository.save(...)     ← the change becomes durable')
  note('      const events = pull(...)       ← drained, so never replayed')
  note('      await publisher.publish(...)   ← only now does the world hear')
  note('')
  note('  Publish first and you may announce something that then fails to')
  note('  persist. Handlers will have set aside a copy, emailed a member and')
  note('  decremented a counter on the strength of a fact that never happened.')
  note('  There is no undo for an email.')
  note('')
  note('  The remaining gap — the write commits, the process dies before')
  note('  publishing — is closed in production by a transactional outbox: write')
  note('  the events in the same transaction as the state, and let a relay push')
  note('  them. Everything above stays true; only `publish` changes. That is')
  note('  why application code depends on the `EventPublisher` interface and')
  note('  never on `InMemoryEventBus`.')

  // ───────────────────────────────────────────────────────────────────────────
  section('The answer, stated plainly')

  note('  ┌──────────────────────────────────────────────────────────────────┐')
  note('  │ A child entity MAY record a domain event, when the fact being     │')
  note('  │ stated is one that only it holds the knowledge for — a Copy’s     │')
  note('  │ condition, a HoldRequest’s own deadline lapsing.                  │')
  note('  │                                                                   │')
  note('  │ The aggregate root records facts about the cluster — that the     │')
  note('  │ shelf is empty, that this member was chosen ahead of the others.  │')
  note('  │ Neither of those can be known from inside a single child.         │')
  note('  │                                                                   │')
  note('  │ Publication is always the root’s, because publication asserts     │')
  note('  │ that the change was consistent, and only the root can know that.  │')
  note('  └──────────────────────────────────────────────────────────────────┘')
  note('')
  note('  Practical test when you are unsure: ask whether the event could be')
  note('  raised while the aggregate is halfway through a change and still')
  note('  inconsistent. If yes, it must not leave until the root says so —')
  note('  which is exactly what buffering plus commit-then-publish enforces.')
  note('')
  note('  See docs/05-domain-events.md for the same argument in prose, with')
  note('  the positions from the linked StackOverflow threads set side by side.')
}

/* ────────────────────────────────────────────────────────────────────────────
 *  A minimal pair of aggregates, built directly on @local/ddd-core, whose only
 *  difference is whether the root declares its children. Kept in this file
 *  rather than in a package because its entire purpose is to be *wrong* in one
 *  specific way, and wrong code should not be importable.
 * ──────────────────────────────────────────────────────────────────────────── */

class CrateId extends Identifier {
  declare protected readonly _tag: 'CrateId'
  private constructor(value: string) {
    super(value)
  }
  static of(value: string): CrateId {
    return new CrateId(value)
  }
}

class BottleId extends Identifier {
  declare protected readonly _tag: 'BottleId'
  private constructor(value: string) {
    super(value)
  }
  static of(value: string): BottleId {
    return new BottleId(value)
  }
}

class BottleCracked extends DomainEvent {
  static readonly eventName = 'demo.bottle-cracked'
  readonly name = BottleCracked.eventName
  readonly bottleId: string

  constructor(bottleId: BottleId) {
    super()
    this.bottleId = bottleId.value
  }

  payload() {
    return { bottleId: this.bottleId }
  }
}

class Bottle extends Entity<BottleId> {
  constructor(id: BottleId) {
    super(id)
  }

  /** The child records a fact about itself. Perfectly legitimate. */
  crack(): void {
    this.record(new BottleCracked(this.id))
  }
}

/** Does NOT declare its children. Its bottles' events go nowhere. */
class ForgetfulCrate extends AggregateRoot<CrateId> {
  protected readonly bottles: Bottle[] = []

  constructor(id: CrateId) {
    super(id)
  }

  add(bottleId: BottleId): void {
    this.bottles.push(new Bottle(bottleId))
  }

  crack(bottleId: BottleId): void {
    this.bottles.find((bottle) => bottle.id.equals(bottleId))?.crack()
  }

  override assertInvariants(): void {
    // Nothing to protect in this toy.
  }
}

/** Identical, plus the four lines that matter. */
class AttentiveCrate extends ForgetfulCrate {
  protected override childEntities(): readonly Entity<Identifier>[] {
    return this.bottles
  }
}

await run()
