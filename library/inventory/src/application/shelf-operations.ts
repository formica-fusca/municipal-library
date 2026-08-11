import type { Clock } from '@local/ddd-core'
import type { UnitOfWork } from '@local/event-bus'
import type { CopyId, TitleId } from '@local/shared-kernel'
import type { BookStockRepository } from '../domain/book-stock-repository.js'
import { CopyNotInStock, NoCopyAvailable } from '../domain/errors.js'

/**
 * The counter operations a librarian performs on the shelves.
 *
 * Grouped into one service because they share the same three dependencies and
 * the same one-line shape. Splitting them into five classes would add files
 * without adding a single decision.
 *
 * Every method here is the same four steps — load the aggregate, call one
 * method on it, commit, return a *value*. In particular `lendAnyCopy` returns a
 * `CopyId` and never a `Copy`: the entity does not leave the boundary, so the
 * caller cannot mutate it, and the aggregate's counter cannot be bypassed.
 */
export class ShelfOperations {
  readonly #stocks: BookStockRepository
  readonly #unitOfWork: UnitOfWork
  readonly #clock: Clock

  constructor(deps: { stocks: BookStockRepository; unitOfWork: UnitOfWork; clock: Clock }) {
    this.#stocks = deps.stocks
    this.#unitOfWork = deps.unitOfWork
    this.#clock = deps.clock
  }

  async lendAnyCopy(titleId: TitleId): Promise<CopyId> {
    const stock = await this.#stocks.findById(titleId)
    if (stock === undefined) throw new NoCopyAvailable(titleId.value)

    const copyId = stock.lendOutAnyCopy(this.#clock.now())

    await this.#unitOfWork.commit(this.#stocks, stock)
    return copyId
  }

  async acceptReturn(titleId: TitleId, copyId: CopyId): Promise<void> {
    const stock = await this.#stocks.findById(titleId)
    if (stock === undefined) throw new CopyNotInStock(copyId.value, titleId.value)

    stock.acceptReturn(copyId, this.#clock.now())

    await this.#unitOfWork.commit(this.#stocks, stock)
  }

  async reportDamaged(titleId: TitleId, copyId: CopyId, reason: string): Promise<void> {
    const stock = await this.#stocks.findById(titleId)
    if (stock === undefined) throw new CopyNotInStock(copyId.value, titleId.value)

    stock.reportDamaged(copyId, reason, this.#clock.now())

    await this.#unitOfWork.commit(this.#stocks, stock)
  }

  async reportLost(titleId: TitleId, copyId: CopyId): Promise<void> {
    const stock = await this.#stocks.findById(titleId)
    if (stock === undefined) throw new CopyNotInStock(copyId.value, titleId.value)

    stock.reportLost(copyId, this.#clock.now())

    await this.#unitOfWork.commit(this.#stocks, stock)
  }

  async repair(titleId: TitleId, copyId: CopyId): Promise<void> {
    const stock = await this.#stocks.findById(titleId)
    if (stock === undefined) throw new CopyNotInStock(copyId.value, titleId.value)

    stock.repair(copyId, this.#clock.now())

    await this.#unitOfWork.commit(this.#stocks, stock)
  }

  /**
   * A read. Note that it returns a number, not an aggregate — callers get a
   * fact, not a handle they might be tempted to mutate.
   */
  async availableCount(titleId: TitleId): Promise<number> {
    const stock = await this.#stocks.findById(titleId)
    return stock?.availableCount ?? 0
  }
}
