import {
  COLLECTION_WINDOW_HOURS,
  HoldQueue,
  HoldRequestId,
  SkipIneligibleAllocation,
  StrictFifoAllocation,
} from '@local/library-lending'
import { addHours, MemberId, TitleId } from '@local/shared-kernel'
import { beforeEach, describe, expect, it } from 'vitest'

const DUNE = TitleId.of('TITLE-DUNE')
const T0 = new Date('2026-03-02T09:00:00Z')

const alice = MemberId.of('CARD-0001')
const bruno = MemberId.of('CARD-0002')
const chloe = MemberId.of('CARD-0003')

const hold = (n: number) => HoldRequestId.of(`HOLD-${String(n).padStart(4, '0')}`)
const minutesLater = (minutes: number) => new Date(T0.getTime() + minutes * 60 * 1000)

describe('HoldQueue', () => {
  let queue: HoldQueue

  beforeEach(() => {
    queue = HoldQueue.open(DUNE)
    queue.place(hold(1), alice, minutesLater(0))
    queue.place(hold(2), bruno, minutesLater(10))
    queue.place(hold(3), chloe, minutesLater(20))
    queue.pullDomainEvents()
  })

  describe('invariants', () => {
    it('refuses a member a second place in the same queue', () => {
      expect(() => queue.place(hold(9), alice, minutesLater(30))).toThrowError(
        /already waiting/,
      )
    })

    it('lets a member re-queue after cancelling — cancelling frees the place', () => {
      queue.cancel(alice, minutesLater(30))
      expect(() => queue.place(hold(9), alice, minutesLater(40))).not.toThrow()
      expect(() => queue.assertInvariants()).not.toThrow()
    })

    it('keeps a collect-by date exactly for allocated holds', () => {
      const snapshotBefore = queue.snapshot()
      expect(snapshotBefore.requests.every((request) => request.collectBy === null)).toBe(true)

      queue.allocateNext(new StrictFifoAllocation(), minutesLater(30))

      const allocated = queue.snapshot().requests.filter((r) => r.status === 'Allocated')
      expect(allocated).toHaveLength(1)
      expect(allocated[0]!.collectBy).not.toBeNull()
      expect(() => queue.assertInvariants()).not.toThrow()
    })
  })

  describe('allocation is driven by an injected policy', () => {
    it('gives the copy to whoever waited longest, under strict FIFO', () => {
      const chosen = queue.allocateNext(new StrictFifoAllocation(), minutesLater(30))
      expect(chosen?.value).toBe(alice.value)
    })

    it('skips members the policy was told cannot borrow', () => {
      // The outside knowledge — who is suspended — arrives through the
      // policy's constructor, gathered before the call. The aggregate method
      // stays pure.
      const policy = new SkipIneligibleAllocation([alice.value, bruno.value])

      const chosen = queue.allocateNext(policy, minutesLater(30))
      expect(chosen?.value).toBe(chloe.value)
    })

    it('allocates nobody when the policy declines everyone', () => {
      const policy = new SkipIneligibleAllocation([alice.value, bruno.value, chloe.value])
      expect(queue.allocateNext(policy, minutesLater(30))).toBeUndefined()
    })

    it('records the allocation on the ROOT, not on the child', () => {
      queue.allocateNext(new StrictFifoAllocation(), minutesLater(30))
      const names = queue.pullDomainEvents().map((event) => event.name)
      expect(names).toEqual(['lending.hold-allocated'])
    })
  })

  describe('collection window', () => {
    it('lapses after the window and passes to the next member', () => {
      queue.allocateNext(new StrictFifoAllocation(), T0)
      queue.pullDomainEvents()

      const justInside = addHours(T0, COLLECTION_WINDOW_HOURS - 1)
      expect(queue.expireLapsedAllocations(justInside)).toBe(0)

      const justOutside = addHours(T0, COLLECTION_WINDOW_HOURS + 1)
      expect(queue.expireLapsedAllocations(justOutside)).toBe(1)

      // The expiry is recorded by the CHILD HoldRequest — it is the only
      // object that knows its own deadline passed.
      expect(queue.pullDomainEvents().map((event) => event.name)).toEqual([
        'lending.hold-expired',
      ])

      const next = queue.allocateNext(new StrictFifoAllocation(), justOutside)
      expect(next?.value).toBe(bruno.value)
    })

    it('refuses collection by a member with nothing set aside', () => {
      expect(() => queue.collect(bruno, minutesLater(30))).toThrowError(/set aside/)
    })

    it('fulfils a hold that was allocated', () => {
      queue.allocateNext(new StrictFifoAllocation(), T0)
      queue.pullDomainEvents()

      queue.collect(alice, minutesLater(30))

      expect(queue.pullDomainEvents().map((event) => event.name)).toEqual([
        'lending.hold-fulfilled',
      ])
      expect(queue.positionOf(alice)).toBeUndefined()
      expect(queue.positionOf(bruno)).toBe(1)
    })
  })

  it('reports position among active requests only', () => {
    expect(queue.positionOf(alice)).toBe(1)
    expect(queue.positionOf(bruno)).toBe(2)

    queue.cancel(alice, minutesLater(30))

    expect(queue.positionOf(alice)).toBeUndefined()
    expect(queue.positionOf(bruno)).toBe(1)
  })
})
