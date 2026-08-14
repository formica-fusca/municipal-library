import { EventLog, InMemoryEventBus, UnitOfWork } from '@local/event-bus'
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
  HoldDesk,
  InMemoryHoldQueueRepository,
  InMemoryLoanRepository,
  LoanClosed,
  LoanOpened,
  ReturnBook,
  StrictFifoAllocation,
  type BorrowerDirectory,
  type BorrowerVerdict,
  type IdentifierFactory,
  type ShelfGateway,
} from '@local/library-lending'
import { FixedClock, MemberId, TitleId } from '@local/shared-kernel'
import { beforeEach, describe, expect, it } from 'vitest'

/*
 * Cross-context behaviour.
 *
 * This file also serves as the shortest possible demonstration of how little
 * wiring the architecture needs: two adapters and three subscriptions connect
 * three bounded contexts that do not import one another.
 */

const DUNE = TitleId.of('TITLE-DUNE')
const ALICE = MemberId.of('CARD-0001')
const BRUNO = MemberId.of('CARD-0002')

function buildLibrary() {
  const clock = new FixedClock(new Date('2026-03-02T09:00:00Z'))
  const bus = new InMemoryEventBus()
  const log = new EventLog().attachTo(bus)
  const unitOfWork = new UnitOfWork(bus)

  const stocks = new InMemoryBookStockRepository()
  const members = new InMemoryMemberRepository()
  const loans = new InMemoryLoanRepository()
  const queues = new InMemoryHoldQueueRepository()

  const shelf = new ShelfOperations({ stocks, unitOfWork, clock })
  const acquireCopy = new AcquireCopy({ stocks, unitOfWork, clock })
  const membershipDesk = new MembershipDesk({ members, unitOfWork, clock })

  const ids: IdentifierFactory = {
    nextLoanId: (() => {
      let n = 0
      return () => `LOAN-${++n}`
    })(),
    nextHoldRequestId: (() => {
      let n = 0
      return () => `HOLD-${++n}`
    })(),
  }

  const shelfGateway: ShelfGateway = {
    async lendAnyCopy(titleId) {
      try {
        return await shelf.lendAnyCopy(titleId)
      } catch (error) {
        if (error instanceof NoCopyAvailable) return undefined
        throw error
      }
    },
    acceptReturn: (titleId, copyId) => shelf.acceptReturn(titleId, copyId),
    availableCount: (titleId) => shelf.availableCount(titleId),
  }

  const borrowers: BorrowerDirectory = {
    async eligibilityToBorrow(memberId): Promise<BorrowerVerdict> {
      const verdict = await membershipDesk.eligibilityToBorrow(memberId)
      return verdict.allowed ? { allowed: true } : { allowed: false, reason: verdict.reason }
    },
  }

  const holdDesk = new HoldDesk({
    holds: queues,
    loans,
    shelf: shelfGateway,
    ids,
    unitOfWork,
    clock,
    allocationPolicy: new StrictFifoAllocation(),
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

  // Membership keeps its counter in step by listening, not by being called.
  //
  // Both directions are needed, and forgetting one is a real and quiet bug:
  // subscribe only to LoanOpened and the counter climbs forever, until every
  // member appears to be at their borrowing limit. Nothing throws; the number
  // is simply wrong. The last test in this file pins both directions.
  bus.on(LoanOpened, async (event) => {
    await membershipDesk.recordLoanTaken(MemberId.of(event.memberId))
  })

  bus.on(LoanClosed, async (event) => {
    await membershipDesk.recordLoanReturned(MemberId.of(event.memberId))
  })

  bus.on(TitleBecameAvailable, async (event) => {
    await holdDesk.allocateOnAvailability(TitleId.of(event.titleId))
  })

  return {
    clock,
    log,
    stocks,
    members,
    loans,
    queues,
    shelf,
    acquireCopy,
    membershipDesk,
    holdDesk,
    borrowBook,
    returnBook,
  }
}

describe('cross-context flows', () => {
  let library: ReturnType<typeof buildLibrary>

  beforeEach(async () => {
    library = buildLibrary()
    await library.acquireCopy.execute({ titleId: DUNE.value, barcode: 'LIB-000101' })
    await library.membershipDesk.enrol({ memberId: ALICE.value, name: 'Alice', tier: 'Adult' })
    await library.membershipDesk.enrol({ memberId: BRUNO.value, name: 'Bruno', tier: 'Adult' })
    library.log.clear()
  })

  it('updates the member’s counter through an event, not a method call', async () => {
    const before = await library.members.findById(ALICE)
    expect(before?.activeLoans).toBe(0)

    await library.borrowBook.execute({ memberId: ALICE, titleId: DUNE })

    const after = await library.members.findById(ALICE)
    expect(after?.activeLoans).toBe(1)
    expect(library.log.names()).toContain('lending.loan-opened')
  })

  it('offers no-copy-available rather than throwing when the shelf is empty', async () => {
    await library.borrowBook.execute({ memberId: ALICE, titleId: DUNE })

    const outcome = await library.borrowBook.execute({ memberId: BRUNO, titleId: DUNE })
    expect(outcome.kind).toBe('no-copy-available')
  })

  it('allocates a returned copy to the front of the queue, with no direct call between contexts', async () => {
    const lent = await library.borrowBook.execute({ memberId: ALICE, titleId: DUNE })
    expect(lent.kind).toBe('lent')

    await library.holdDesk.placeHold({ titleId: DUNE, memberId: BRUNO })
    library.log.clear()

    if (lent.kind !== 'lent') throw new Error('unreachable')
    await library.returnBook.execute({ copyId: lent.copyId })

    // Inventory announced availability; Lending reacted. Neither imports the
    // other; the subscription above is the only connection.
    expect(library.log.names()).toEqual([
      'inventory.copy-returned',
      'inventory.title-became-available',
      'lending.hold-allocated',
      'lending.loan-closed',
    ])

    const queue = await library.holdDesk.queueFor(DUNE)
    expect(queue?.hasAllocationFor(BRUNO)).toBe(true)
  })

  it('stops a walk-in taking a copy that is set aside for someone ahead of them', async () => {
    const lent = await library.borrowBook.execute({ memberId: ALICE, titleId: DUNE })
    if (lent.kind !== 'lent') throw new Error('unreachable')

    await library.holdDesk.placeHold({ titleId: DUNE, memberId: BRUNO })
    await library.returnBook.execute({ copyId: lent.copyId })

    const outcome = await library.borrowBook.execute({ memberId: ALICE, titleId: DUNE })
    expect(outcome.kind).toBe('refused')
    expect(outcome.kind === 'refused' && outcome.reason).toMatch(/set aside/)
  })

  it('refuses a suspended member at the counter', async () => {
    await library.membershipDesk.suspend(ALICE, 'fines', new Date('2026-05-01T00:00:00Z'))

    const outcome = await library.borrowBook.execute({ memberId: ALICE, titleId: DUNE })
    expect(outcome.kind).toBe('refused')
    expect(outcome.kind === 'refused' && outcome.reason).toMatch(/suspended/)

    // Nothing left the shelf.
    expect(await library.shelf.availableCount(DUNE)).toBe(1)
  })

  it('returns the counter to zero across repeated cycles — both subscriptions, not just one', async () => {
    for (let round = 0; round < 3; round += 1) {
      const lent = await library.borrowBook.execute({ memberId: ALICE, titleId: DUNE })
      if (lent.kind !== 'lent') throw new Error(`round ${round}: ${lent.kind}`)
      await library.returnBook.execute({ copyId: lent.copyId })
    }

    const stock = await library.stocks.findById(DUNE)
    expect(stock?.availableCount).toBe(1)
    expect(stock?.snapshot().copies[0]?.timesLent).toBe(3)
    expect(() => stock?.assertInvariants()).not.toThrow()

    const alice = await library.members.findById(ALICE)
    expect(alice?.activeLoans).toBe(0)
  })
})
