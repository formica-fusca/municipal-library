import { DomainError } from '@local/ddd-core'
import type { UnitOfWork } from '@local/event-bus'
import { Isbn, Money, type Clock } from '@local/shared-kernel'
import { ProductId } from '../domain/identities.js'
import type { StockItemRepository } from '../domain/stock-item-repository.js'
import { StockItem } from '../domain/stock-item.js'

export class UnknownProduct extends DomainError {
  constructor(productId: string) {
    super(`the shop does not stock product ${productId}`)
  }
}

/** The till and the stockroom door. Thin, like every application service here. */
export class ShopCounter {
  readonly #stock: StockItemRepository
  readonly #unitOfWork: UnitOfWork
  readonly #clock: Clock

  constructor(deps: { stock: StockItemRepository; unitOfWork: UnitOfWork; clock: Clock }) {
    this.#stock = deps.stock
    this.#unitOfWork = deps.unitOfWork
    this.#clock = deps.clock
  }

  async list(command: {
    productId: string
    isbn: string
    priceEuros: number
  }): Promise<ProductId> {
    const item = StockItem.open({
      productId: ProductId.of(command.productId),
      isbn: Isbn.of(command.isbn),
      unitPrice: Money.euros(command.priceEuros),
    })

    await this.#unitOfWork.commit(this.#stock, item)
    return item.id
  }

  async receiveDelivery(productId: ProductId, quantity: number): Promise<void> {
    const item = await this.#load(productId)
    item.receive(quantity, this.#clock.now())
    await this.#unitOfWork.commit(this.#stock, item)
  }

  async reserveForCollection(
    productId: ProductId,
    quantity: number,
    customerReference: string,
  ): Promise<void> {
    const item = await this.#load(productId)
    item.reserve(quantity, customerReference, this.#clock.now())
    await this.#unitOfWork.commit(this.#stock, item)
  }

  async sellOverTheCounter(productId: ProductId, quantity: number): Promise<Money> {
    const item = await this.#load(productId)
    const takings = item.sell(quantity, this.#clock.now())
    await this.#unitOfWork.commit(this.#stock, item)
    return takings
  }

  async collectReservation(productId: ProductId, quantity: number): Promise<Money> {
    const item = await this.#load(productId)
    const takings = item.collectReservation(quantity, this.#clock.now())
    await this.#unitOfWork.commit(this.#stock, item)
    return takings
  }

  async inspect(productId: ProductId): Promise<StockItem> {
    return this.#load(productId)
  }

  async #load(productId: ProductId): Promise<StockItem> {
    const item = await this.#stock.findById(productId)
    if (item === undefined) throw new UnknownProduct(productId.value)
    return item
  }
}
