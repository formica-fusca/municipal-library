import type { UnitOfWork } from '@local/event-bus'
import { CopyId, TitleId, type Clock } from '@local/shared-kernel'
import { BookStock } from '../domain/book-stock.js'
import type { BookStockRepository } from '../domain/book-stock-repository.js'

export interface AcquireCopyCommand {
  readonly titleId: string
  readonly barcode: string
}

/**
 * A new physical volume arrives and is shelved.
 *
 * The `?? BookStock.open(...)` is worth pausing on. "There is no stock record
 * for this title yet" and "there is a stock record holding zero copies" are the
 * same thing to a librarian, so the model should not force the caller to know
 * which one it is dealing with. Lazily opening the aggregate on first
 * acquisition keeps that distinction out of the ubiquitous language.
 */
export class AcquireCopy {
  readonly #stocks: BookStockRepository
  readonly #unitOfWork: UnitOfWork
  readonly #clock: Clock

  constructor(deps: { stocks: BookStockRepository; unitOfWork: UnitOfWork; clock: Clock }) {
    this.#stocks = deps.stocks
    this.#unitOfWork = deps.unitOfWork
    this.#clock = deps.clock
  }

  async execute(command: AcquireCopyCommand): Promise<void> {
    const titleId = TitleId.of(command.titleId)
    const stock = (await this.#stocks.findById(titleId)) ?? BookStock.open(titleId)

    stock.acquireCopy(CopyId.of(command.barcode), this.#clock.now())

    await this.#unitOfWork.commit(this.#stocks, stock)
  }
}
