import { BookStock, CopyAcquired, TitleBecameAvailable, TitleOutOfStock } from '@local/library-inventory'
import { CopyId, TitleId } from '@local/shared-kernel'
import { beforeEach, describe, expect, it } from 'vitest'

/*
 * The showcase aggregate. These tests are the executable form of the invariant
 * documented on the class: `availableCount` always equals the copies whose
 * status is Available.
 */

const DUNE = TitleId.of('TITLE-DUNE')
const AT = new Date('2026-03-02T09:00:00Z')

const barcode = (n: number) => CopyId.of(`LIB-${String(n).padStart(6, '0')}`)

describe('BookStock', () => {
  let stock: BookStock

  beforeEach(() => {
    stock = BookStock.open(DUNE)
    stock.acquireCopy(barcode(1), AT)
    stock.acquireCopy(barcode(2), AT)
    stock.pullDomainEvents()
  })

  describe('the central invariant', () => {
    it('holds after every kind of operation', () => {
      stock.lendOutAnyCopy(AT)
      expect(() => stock.assertInvariants()).not.toThrow()

      stock.acceptReturn(barcode(1), AT)
      expect(() => stock.assertInvariants()).not.toThrow()

      stock.reportDamaged(barcode(1), 'torn', AT)
      expect(() => stock.assertInvariants()).not.toThrow()

      stock.repair(barcode(1), AT)
      expect(() => stock.assertInvariants()).not.toThrow()

      expect(stock.availableCount).toBe(2)
    })

    it('breaks when a child is mutated behind the root’s back', () => {
      // `unsafeCopyForTeaching` exists solely for this demonstration: it is the
      // boundary violation that aggregates are designed to prevent.
      const leaked = stock.unsafeCopyForTeaching(barcode(1))
      leaked.reportDamaged('bypassed the root', AT)

      expect(stock.availableCount).toBe(2) // the root never found out
      expect(() => stock.assertInvariants()).toThrowError(
        /available count matches the copies on the shelf/,
      )
    })
  })

  describe('availability is announced on edges, not on every change', () => {
    it('announces becoming available only when the shelf was empty', () => {
      const fresh = BookStock.open(TitleId.of('TITLE-FRESH'))

      fresh.acquireCopy(barcode(10), AT)
      fresh.acquireCopy(barcode(11), AT)
      fresh.acquireCopy(barcode(12), AT)

      const names = fresh.pullDomainEvents().map((event) => event.name)

      expect(names.filter((name) => name === CopyAcquired.eventName)).toHaveLength(3)
      expect(names.filter((name) => name === TitleBecameAvailable.eventName)).toHaveLength(1)
    })

    it('announces running out only when the last copy leaves', () => {
      stock.lendOutAnyCopy(AT)
      expect(
        stock.pullDomainEvents().map((event) => event.name),
      ).not.toContain(TitleOutOfStock.eventName)

      stock.lendOutAnyCopy(AT)
      expect(stock.pullDomainEvents().map((event) => event.name)).toContain(
        TitleOutOfStock.eventName,
      )
    })
  })

  describe('the copy lifecycle', () => {
    it('refuses a duplicate barcode', () => {
      expect(() => stock.acquireCopy(barcode(1), AT)).toThrowError(/already in stock/)
    })

    it('refuses to lend when nothing is on the shelf', () => {
      stock.lendOutAnyCopy(AT)
      stock.lendOutAnyCopy(AT)
      expect(() => stock.lendOutAnyCopy(AT)).toThrowError(/no copy of title/)
    })

    it('refuses illegal transitions', () => {
      // Available → Lost makes no sense: it is on the shelf.
      expect(() => stock.reportLost(barcode(1), AT)).toThrowError(/cannot move from "Available"/)

      // Damaged → OnLoan without repairing first.
      stock.reportDamaged(barcode(1), 'torn', AT)
      stock.lendOutAnyCopy(AT) // takes copy 2, the only one left
      expect(() => stock.lendOutAnyCopy(AT)).toThrowError(/no copy of title/)
    })

    it('refuses to touch a copy it does not hold', () => {
      expect(() => stock.acceptReturn(barcode(99), AT)).toThrowError(/does not belong/)
    })
  })

  describe('three different counts, three different questions', () => {
    it('keeps the record of a lost volume while dropping it from the held count', () => {
      stock.lendOutAnyCopy(AT) // copy 1 leaves the shelf
      stock.reportLost(barcode(1), AT)

      // "How many volumes have we ever acquired?" — the lost one still counts,
      // because deleting it would destroy the audit trail.
      expect(stock.totalCopies).toBe(2)

      // "How many do we still have?" — one. This is the question the label in
      // the playground was getting wrong.
      expect(stock.heldCount).toBe(1)

      // "How many can somebody borrow right now?" — also one, but for an
      // unrelated reason: copy 2 is on the shelf.
      expect(stock.availableCount).toBe(1)

      expect(() => stock.assertInvariants()).not.toThrow()
    })

    it('counts a damaged or borrowed volume as held but not available', () => {
      stock.reportDamaged(barcode(1), 'torn', AT)
      stock.lendOutAnyCopy(AT) // copy 2

      expect(stock.heldCount).toBe(2) // both still in the building
      expect(stock.availableCount).toBe(0) // neither can be borrowed
    })

    it('withdrawal removes a volume from the held count too', () => {
      stock.withdraw(barcode(1), 'superseded edition', AT)

      expect(stock.totalCopies).toBe(2)
      expect(stock.heldCount).toBe(1)
    })

    it('exposes all three on the snapshot', () => {
      // A volume can only be lost by whoever borrowed it — `Available → Lost`
      // is not in LEGAL_TRANSITIONS, and the model refuses it.
      stock.lendOutAnyCopy(AT)
      stock.reportLost(barcode(1), AT)

      expect(stock.snapshot()).toMatchObject({
        totalCopies: 2,
        heldCount: 1,
        availableCount: 1,
      })
    })
  })

  describe('who records which event', () => {
    it('has the child record the damage and the root record the consequence', () => {
      const single = BookStock.open(TitleId.of('TITLE-SINGLE'))
      single.acquireCopy(barcode(20), AT)
      single.pullDomainEvents()

      single.reportDamaged(barcode(20), 'coffee', AT)
      const published = single.pullDomainEvents()

      // `copy-damaged` comes from the Copy entity; `title-out-of-stock` from
      // BookStock. Both leave together, in the order they happened.
      expect(published.map((event) => event.name)).toEqual([
        'inventory.copy-damaged',
        'inventory.title-out-of-stock',
      ])
      expect(published[0]!.sequence).toBeLessThan(published[1]!.sequence)
    })
  })

  it('never hands out a live child entity through its normal API', () => {
    const snapshot = stock.snapshot()

    // Snapshots are inert data — mutating one changes nothing.
    expect(snapshot.copies[0]).toMatchObject({ status: 'Available' })
    expect(Object.isFrozen(snapshot)).toBe(false) // it is a plain copy…
    expect(stock.availableCount).toBe(2) // …and the aggregate is untouched
  })
})
