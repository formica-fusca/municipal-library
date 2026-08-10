import { FixedClock } from '@local/ddd-core'
import type { DomainEvent } from '@local/ddd-core'
import { EventLog, InMemoryEventBus, UnitOfWork } from '@local/event-bus'
import { MemberId, TitleId } from '@local/shared-kernel'
import type { CopyId } from '@local/shared-kernel'

import { InMemoryTitleRepository, RegisterTitle } from '@local/library-catalog'
import {
  AcquireCopy,
  InMemoryBookStockRepository,
  NoCopyAvailable,
  ShelfOperations,
  TitleBecameAvailable,
} from '@local/library-inventory'
import { InMemoryMemberRepository, MembershipDesk } from '@local/library-membership'
import {
  BorrowBook,
  HoldAllocated,
  HoldDesk,
  HoldExpired,
  InMemoryHoldQueueRepository,
  InMemoryLoanRepository,
  LoanBecameOverdue,
  LoanClosed,
  LoanOpened,
  OverdueSweep,
  ReturnBook,
  StrictFifoAllocation,
  type BorrowerDirectory,
  type BorrowerVerdict,
  type HoldAllocationPolicy,
  type IdentifierFactory,
  type ShelfGateway,
} from '@local/library-lending'
import { InMemoryStockItemRepository, ShopCounter } from '@local/bookshop-inventory'

/**
 * # The composition root
 *
 * This is the only file in the repository that imports more than one bounded
 * context, and that is the architecture rather than an accident. Every
 * connection between contexts is one of exactly two things, and both are
 * visible here in one screen:
 *
 * 1. **An adapter** implementing a port that the consuming context declared.
 * 2. **A subscription** on the event bus.
 *
 * Nothing else crosses a border. `grep -l "library-inventory" packages/` finds
 * no importer outside this package, and `tsc -b` enforces it: the contexts do
 * not list each other as dependencies, so an import would not resolve.
 *
 * ## Why this is a package and not part of an app
 *
 * It used to live in `apps/scenarios`, which made the terminal walkthroughs and
 * the composition root the same thing by accident. They are not the same thing.
 * A composition root says *how the parts connect*; an app says *how a human
 * drives them*. There are two of the latter here — six narrated scripts and a
 * browser playground — and only one of the former, which is the point.
 *
 * `tsconfig.json` gives this package `"types": []`, so it cannot reach for
 * `console` or `process` even by accident. The `onEvent` option below exists
 * because of that constraint: printing an event is the app's job, in whatever
 * vocabulary its medium has.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Adapters — the anti-corruption layer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lending asked for a `ShelfGateway`. Inventory offers `ShelfOperations`. This
 * class is the seam between the two vocabularies.
 *
 * The `catch` is the interesting line. Inventory signals "nothing on the shelf"
 * by throwing `NoCopyAvailable`; Lending's port says the answer is `undefined`.
 * Translating here means Lending never has to know that Inventory has an
 * exception type by that name — and catching a foreign exception type in
 * business code is an import in disguise, which quietly promotes somebody
 * else's error class into your public contract.
 */
class ShelfAdapter implements ShelfGateway {
  readonly #shelf: ShelfOperations

  constructor(shelf: ShelfOperations) {
    this.#shelf = shelf
  }

  async lendAnyCopy(titleId: TitleId): Promise<CopyId | undefined> {
    try {
      return await this.#shelf.lendAnyCopy(titleId)
    } catch (error) {
      if (error instanceof NoCopyAvailable) return undefined
      throw error
    }
  }

  async acceptReturn(titleId: TitleId, copyId: CopyId): Promise<void> {
    await this.#shelf.acceptReturn(titleId, copyId)
  }

  async availableCount(titleId: TitleId): Promise<number> {
    return this.#shelf.availableCount(titleId)
  }
}

/**
 * Membership's `BorrowEligibility` and Lending's `BorrowerVerdict` are
 * structurally identical, so this adapter is nearly a no-op — and it is still
 * worth having. It is the single place that would change if Membership added a
 * tier concept, a fines balance, or renamed the type.
 */
class BorrowerDirectoryAdapter implements BorrowerDirectory {
  readonly #desk: MembershipDesk

  constructor(desk: MembershipDesk) {
    this.#desk = desk
  }

  async eligibilityToBorrow(memberId: MemberId): Promise<BorrowerVerdict> {
    const eligibility = await this.#desk.eligibilityToBorrow(memberId)
    return eligibility.allowed ? { allowed: true } : { allowed: false, reason: eligibility.reason }
  }
}

/**
 * Deterministic ids, so a scenario transcript is byte-identical between runs.
 *
 * `randomUUID()` would make the output undiffable and would hide behavioural
 * changes in a wall of noise. Minting ids outside the domain also keeps
 * aggregates pure: nothing in `packages/` reaches for a source of randomness.
 */
class SequentialIds implements IdentifierFactory {
  #loans = 0
  #holds = 0

  nextLoanId(): string {
    this.#loans += 1
    return `LOAN-${String(this.#loans).padStart(4, '0')}`
  }

  nextHoldRequestId(): string {
    this.#holds += 1
    return `HOLD-${String(this.#holds).padStart(4, '0')}`
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  The assembled library
// ─────────────────────────────────────────────────────────────────────────────

export interface Library {
  readonly clock: FixedClock
  readonly bus: InMemoryEventBus
  readonly log: EventLog
  /** Member-facing messages produced by subscribers — a tiny read side. */
  readonly notifications: string[]

  readonly titles: InMemoryTitleRepository
  readonly stocks: InMemoryBookStockRepository
  readonly members: InMemoryMemberRepository
  readonly loans: InMemoryLoanRepository
  readonly queues: InMemoryHoldQueueRepository
  readonly shopStock: InMemoryStockItemRepository

  readonly registerTitle: RegisterTitle
  readonly acquireCopy: AcquireCopy
  readonly shelf: ShelfOperations
  readonly membershipDesk: MembershipDesk
  readonly borrowBook: BorrowBook
  readonly returnBook: ReturnBook
  readonly holdDesk: HoldDesk
  readonly overdueSweep: OverdueSweep
  readonly shop: ShopCounter
}

export interface LibraryOptions {
  readonly startAt?: Date
  readonly allocationPolicy?: HoldAllocationPolicy

  /**
   * Called for every event the bus dispatches.
   *
   * This was a `traceEvents: boolean` that printed ANSI escape codes to
   * `console`, which was a terminal assumption sitting inside pure
   * composition — invisible until something else tried to consume this file.
   * As a callback, the scenarios pass a dim-grey console printer and the
   * browser playground appends a row to a table, and neither medium's
   * vocabulary leaks in here.
   */
  readonly onEvent?: (event: DomainEvent) => void
}

export function buildLibrary(options: LibraryOptions = {}): Library {
  const clock = new FixedClock(options.startAt ?? new Date('2026-03-02T09:00:00Z'))
  const bus = new InMemoryEventBus()
  const log = new EventLog().attachTo(bus)
  const unitOfWork = new UnitOfWork(bus)
  const ids = new SequentialIds()
  const notifications: string[] = []

  // ── Repositories ──────────────────────────────────────────────────────────
  const titles = new InMemoryTitleRepository()
  const stocks = new InMemoryBookStockRepository()
  const members = new InMemoryMemberRepository()
  const loans = new InMemoryLoanRepository()
  const queues = new InMemoryHoldQueueRepository()
  const shopStock = new InMemoryStockItemRepository()

  // ── Application services, per context ─────────────────────────────────────
  const registerTitle = new RegisterTitle({ titles, unitOfWork, clock })
  const acquireCopy = new AcquireCopy({ stocks, unitOfWork, clock })
  const shelf = new ShelfOperations({ stocks, unitOfWork, clock })
  const membershipDesk = new MembershipDesk({ members, unitOfWork, clock })
  const shop = new ShopCounter({ stock: shopStock, unitOfWork, clock })

  const shelfGateway = new ShelfAdapter(shelf)
  const borrowers = new BorrowerDirectoryAdapter(membershipDesk)

  const holdDesk = new HoldDesk({
    holds: queues,
    loans,
    shelf: shelfGateway,
    ids,
    unitOfWork,
    clock,
    allocationPolicy: options.allocationPolicy ?? new StrictFifoAllocation(),
  })

  const borrowBook = new BorrowBook({
    loans,
    holds: queues,
    borrowers,
    shelf: shelfGateway,
    ids,
    unitOfWork,
    clock,
  })

  const returnBook = new ReturnBook({ loans, shelf: shelfGateway, unitOfWork, clock })
  const overdueSweep = new OverdueSweep({ loans, unitOfWork, clock })

  // ── Subscriptions — every remaining cross-context link ────────────────────
  //
  // Read these as sentences. "When a loan is opened, membership notes it."
  // Neither side knows the other exists; both know the event.

  bus.on(LoanOpened, async (event) => {
    await membershipDesk.recordLoanTaken(MemberId.of(event.memberId))
  })

  bus.on(LoanClosed, async (event) => {
    await membershipDesk.recordLoanReturned(MemberId.of(event.memberId))
  })

  /**
   * The link that makes the hold queue work.
   *
   * Inventory raised this because *its own* state changed. It has no idea a
   * queue exists. Adding a second reaction — print a slip for the hold shelf,
   * email the member — means adding a subscriber here and changing nothing in
   * Inventory. That is the property the bus is bought for.
   */
  bus.on(TitleBecameAvailable, async (event) => {
    await holdDesk.allocateOnAvailability(TitleId.of(event.titleId))
  })

  // A read side: messages the member would actually receive.
  bus.on(HoldAllocated, (event) => {
    notifications.push(
      `${event.memberId}: your copy is on the hold shelf — collect by ${event.collectBy.slice(0, 16).replace('T', ' ')}`,
    )
  })

  bus.on(HoldExpired, (event) => {
    notifications.push(`${event.memberId}: your hold lapsed and passed to the next member`)
  })

  bus.on(LoanBecameOverdue, (event) => {
    notifications.push(`${event.memberId}: loan ${event.loanId} is ${event.daysLate} day(s) overdue`)
  })

  if (options.onEvent !== undefined) {
    bus.onAny(options.onEvent)
  }

  return {
    clock,
    bus,
    log,
    notifications,
    titles,
    stocks,
    members,
    loans,
    queues,
    shopStock,
    registerTitle,
    acquireCopy,
    shelf,
    membershipDesk,
    borrowBook,
    returnBook,
    holdDesk,
    overdueSweep,
    shop,
  }
}

/** The fixture used by most scenarios: one title, three copies, three members. */
export async function seedLibrary(library: Library): Promise<{
  dune: TitleId
  alice: MemberId
  bruno: MemberId
  chloe: MemberId
}> {
  const dune = await library.registerTitle.execute({
    titleId: 'TITLE-DUNE',
    isbn: '9780441013593',
    heading: 'Dune',
    author: 'Frank Herbert',
    publishedYear: 1965,
  })

  for (const barcode of ['LIB-000101', 'LIB-000102', 'LIB-000103']) {
    await library.acquireCopy.execute({ titleId: dune.value, barcode })
  }

  const alice = await library.membershipDesk.enrol({
    memberId: 'CARD-0001',
    name: 'Alice',
    tier: 'Adult',
  })
  const bruno = await library.membershipDesk.enrol({
    memberId: 'CARD-0002',
    name: 'Bruno',
    tier: 'Adult',
  })
  const chloe = await library.membershipDesk.enrol({
    memberId: 'CARD-0003',
    name: 'Chloé',
    tier: 'Child',
  })

  library.log.clear()

  return { dune, alice, bruno, chloe }
}
