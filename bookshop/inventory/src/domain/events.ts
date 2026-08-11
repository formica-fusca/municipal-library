import { DomainEvent } from '@local/ddd-core'
import type { Money } from '@local/shared-kernel'
import type { ProductId } from './identities.js'

export class StockReceived extends DomainEvent {
  static readonly eventName = 'shop.stock-received'
  readonly name = StockReceived.eventName

  readonly productId: string
  readonly quantity: number

  constructor(params: { productId: ProductId; quantity: number; occurredAt: Date }) {
    super(params.occurredAt)
    this.productId = params.productId.value
    this.quantity = params.quantity
  }

  payload() {
    return { productId: this.productId, quantity: this.quantity }
  }
}

export class StockReserved extends DomainEvent {
  static readonly eventName = 'shop.stock-reserved'
  readonly name = StockReserved.eventName

  readonly productId: string
  readonly quantity: number
  readonly customerReference: string

  constructor(params: {
    productId: ProductId
    quantity: number
    customerReference: string
    occurredAt: Date
  }) {
    super(params.occurredAt)
    this.productId = params.productId.value
    this.quantity = params.quantity
    this.customerReference = params.customerReference
  }

  payload() {
    return {
      productId: this.productId,
      quantity: this.quantity,
      customerReference: this.customerReference,
    }
  }
}

export class StockSold extends DomainEvent {
  static readonly eventName = 'shop.stock-sold'
  readonly name = StockSold.eventName

  readonly productId: string
  readonly quantity: number
  readonly takings: string

  constructor(params: {
    productId: ProductId
    quantity: number
    takings: Money
    occurredAt: Date
  }) {
    super(params.occurredAt)
    this.productId = params.productId.value
    this.quantity = params.quantity
    this.takings = params.takings.format()
  }

  payload() {
    return { productId: this.productId, quantity: this.quantity, takings: this.takings }
  }
}

export class ShelfEmptied extends DomainEvent {
  static readonly eventName = 'shop.shelf-emptied'
  readonly name = ShelfEmptied.eventName

  readonly productId: string

  constructor(params: { productId: ProductId; occurredAt: Date }) {
    super(params.occurredAt)
    this.productId = params.productId.value
  }

  payload() {
    return { productId: this.productId }
  }
}
