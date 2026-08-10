import { AggregateRoot, DomainError, InvariantViolation } from '@local/ddd-core'
import type { Isbn, Money } from '@local/shared-kernel'
import type { ProductId } from './identities.js'
import { ShelfEmptied, StockReceived, StockReserved, StockSold } from './events.js'

export class NotEnoughStock extends DomainError {
  constructor(productId: string, wanted: number, sellable: number) {
    super(`product ${productId}: wanted ${wanted}, only ${sellable} sellable`)
  }
}

export interface StockItemSnapshot {
  readonly productId: string
  readonly isbn: string
  readonly onHand: number
  readonly reserved: number
  readonly sellable: number
  readonly unitPrice: string
}

/**
 * A line of shop stock: how many of this edition are in the back room.
 *
 * # Read this beside `BookStock` in the library
 *
 * Both are called "stock". Both are aggregate roots. They are modelled
 * completely differently, and the difference is not a matter of taste.
 *
 * | | Library `BookStock` | Shop `StockItem` |
 * |---|---|---|
 * | Stock is | a set of identified `Copy` entities | two integers |
 * | Child entities | yes — one per physical volume | **none** |
 * | "Which one?" | a question with an answer | a meaningless question |
 * | Lifecycle | each volume ages, is damaged, repaired, lost | none — units are interchangeable |
 * | Why | the library must know *which copy you have* | the shop only needs to know *how many are left* |
 *
 * A shop customer buying "Dune" does not care which of the four boxed copies
 * they get, and the shop has no reason to track it. The units are **fungible**,
 * so the honest model is a number. Inventing a `ShopCopy` entity with a
 * generated id would produce identity that means nothing, a lifecycle nobody
 * observes, and a table that grows with sales volume for no benefit.
 *
 * The library cannot make the opposite choice. "The copy you have at home" is a
 * phrase its business depends on: overdue notices, damage charges and the hold
 * shelf all need to name a specific volume. Reduce it to a counter and you can
 * no longer express the domain.
 *
 * **The lesson: identity is not a property of the *thing*, it is a property of
 * what your business needs to say about the thing.** The same real-world object
 * — a book on a shelf — is an entity in one context and an anonymous unit in
 * another, and both models are right.
 *
 * # Its invariant
 *
 * `reserved <= onHand`. You cannot promise more copies than you have. It is a
 * relationship between two fields of a single object, which is why this
 * aggregate needs no children to protect it — and a good reminder that "has an
 * invariant" does not imply "has a cluster".
 */
export class StockItem extends AggregateRoot<ProductId> {
  readonly #isbn: Isbn
  readonly #unitPrice: Money
  #onHand: number
  #reserved: number

  private constructor(params: {
    productId: ProductId
    isbn: Isbn
    unitPrice: Money
    onHand: number
    reserved: number
  }) {
    super(params.productId)
    this.#isbn = params.isbn
    this.#unitPrice = params.unitPrice
    this.#onHand = params.onHand
    this.#reserved = params.reserved
  }

  static open(params: { productId: ProductId; isbn: Isbn; unitPrice: Money }): StockItem {
    return new StockItem({ ...params, onHand: 0, reserved: 0 })
  }

  static rehydrate(params: {
    productId: ProductId
    isbn: Isbn
    unitPrice: Money
    onHand: number
    reserved: number
  }): StockItem {
    const item = new StockItem(params)
    item.assertInvariants()
    return item
  }

  receive(quantity: number, at: Date): void {
    this.#requirePositive(quantity)
    this.#onHand += quantity
    this.assertInvariants()
    this.record(new StockReceived({ productId: this.id, quantity, occurredAt: at }))
  }

  /** A customer asks the shop to hold copies for collection. */
  reserve(quantity: number, customerReference: string, at: Date): void {
    this.#requirePositive(quantity)
    if (quantity > this.sellable) {
      throw new NotEnoughStock(this.id.value, quantity, this.sellable)
    }

    this.#reserved += quantity
    this.assertInvariants()
    this.record(new StockReserved({ productId: this.id, quantity, customerReference, occurredAt: at }))
  }

  releaseReservation(quantity: number): void {
    this.#requirePositive(quantity)
    if (quantity > this.#reserved) {
      throw new InvariantViolation(
        'a reservation is not released twice',
        `product ${this.id.value} has ${this.#reserved} reserved, asked to release ${quantity}`,
      )
    }
    this.#reserved -= quantity
    this.assertInvariants()
  }

  /** Sell from the open shelf — not against a reservation. */
  sell(quantity: number, at: Date): Money {
    this.#requirePositive(quantity)
    if (quantity > this.sellable) {
      throw new NotEnoughStock(this.id.value, quantity, this.sellable)
    }

    this.#onHand -= quantity
    const takings = this.#unitPrice.times(quantity)

    this.assertInvariants()
    this.record(new StockSold({ productId: this.id, quantity, takings, occurredAt: at }))

    if (this.#onHand === 0) {
      this.record(new ShelfEmptied({ productId: this.id, occurredAt: at }))
    }

    return takings
  }

  /** Collect a reservation: the reserved units leave the shop. */
  collectReservation(quantity: number, at: Date): Money {
    this.#requirePositive(quantity)
    if (quantity > this.#reserved) {
      throw new NotEnoughStock(this.id.value, quantity, this.#reserved)
    }

    this.#reserved -= quantity
    this.#onHand -= quantity
    const takings = this.#unitPrice.times(quantity)

    this.assertInvariants()
    this.record(new StockSold({ productId: this.id, quantity, takings, occurredAt: at }))

    if (this.#onHand === 0) {
      this.record(new ShelfEmptied({ productId: this.id, occurredAt: at }))
    }

    return takings
  }

  get isbn(): Isbn {
    return this.#isbn
  }

  get onHand(): number {
    return this.#onHand
  }

  get reserved(): number {
    return this.#reserved
  }

  /** What a walk-in customer could actually buy right now. */
  get sellable(): number {
    return this.#onHand - this.#reserved
  }

  get unitPrice(): Money {
    return this.#unitPrice
  }

  snapshot(): StockItemSnapshot {
    return {
      productId: this.id.value,
      isbn: this.#isbn.value,
      onHand: this.#onHand,
      reserved: this.#reserved,
      sellable: this.sellable,
      unitPrice: this.#unitPrice.format(),
    }
  }

  override assertInvariants(): void {
    if (this.#onHand < 0) {
      throw new InvariantViolation(
        'stock on hand is never negative',
        `product ${this.id.value} has ${this.#onHand}`,
      )
    }
    if (this.#reserved < 0) {
      throw new InvariantViolation(
        'reserved stock is never negative',
        `product ${this.id.value} has ${this.#reserved}`,
      )
    }
    if (this.#reserved > this.#onHand) {
      throw new InvariantViolation(
        'the shop never promises more copies than it holds',
        `product ${this.id.value} has ${this.#reserved} reserved but only ${this.#onHand} on hand`,
      )
    }
  }

  #requirePositive(quantity: number): void {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new InvariantViolation(
        'stock moves in whole positive units',
        `received ${quantity} for product ${this.id.value}`,
      )
    }
  }
}
