import { ProductId, StockItem } from '@local/bookshop-inventory'
import { Isbn, Money } from '@local/shared-kernel'
import { beforeEach, describe, expect, it } from 'vitest'

/*
 * The contrast piece. Everything here is about a *quantity*, and the tests are
 * correspondingly boring — which is the point. Compare with book-stock.test.ts,
 * where every assertion is about a specific identified volume.
 */

const AT = new Date('2026-03-02T09:00:00Z')

describe('StockItem — fungible stock', () => {
  let item: StockItem

  beforeEach(() => {
    item = StockItem.open({
      productId: ProductId.of('SHOP-DUNE-PB'),
      isbn: Isbn.of('9780441013593'),
      unitPrice: Money.euros(9.9),
    })
    item.receive(4, AT)
    item.pullDomainEvents()
  })

  it('has no child entities at all', () => {
    // There is nothing to declare, because there is nothing identified inside.
    // `childEntities()` is never overridden, and that is the correct model.
    item.reserve(1, 'Mme Rossi', AT)
    expect(item.pullDomainEvents().map((event) => event.name)).toEqual(['shop.stock-reserved'])
  })

  describe('its one invariant: reserved never exceeds on hand', () => {
    it('refuses to promise stock the shop does not have', () => {
      expect(() => item.reserve(5, 'optimist', AT)).toThrowError(/wanted 5, only 4 sellable/)
    })

    it('refuses to sell stock that is reserved for someone else', () => {
      item.reserve(3, 'Mme Rossi', AT)
      expect(item.sellable).toBe(1)
      expect(() => item.sell(2, AT)).toThrowError(/only 1 sellable/)
    })

    it('holds after every operation', () => {
      item.reserve(2, 'Mme Rossi', AT)
      item.sell(1, AT)
      item.collectReservation(1, AT)
      item.releaseReservation(1)

      expect(item.onHand).toBe(2)
      expect(item.reserved).toBe(0)
      expect(() => item.assertInvariants()).not.toThrow()
    })
  })

  it('announces the shelf emptying', () => {
    item.sell(4, AT)
    expect(item.pullDomainEvents().map((event) => event.name)).toEqual([
      'shop.stock-sold',
      'shop.shelf-emptied',
    ])
  })

  it('takes money in whole cents', () => {
    const takings = item.sell(3, AT)
    expect(takings.cents).toBe(2970)
    expect(takings.format()).toBe('29.70 EUR')
  })

  it('moves stock only in whole positive units', () => {
    expect(() => item.receive(0, AT)).toThrowError(/whole positive units/)
    expect(() => item.receive(-2, AT)).toThrowError(/whole positive units/)
    expect(() => item.sell(1.5, AT)).toThrowError(/whole positive units/)
  })
})
