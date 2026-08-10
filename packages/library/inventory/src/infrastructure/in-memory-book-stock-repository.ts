import { InMemoryRepository } from '@local/ddd-core/testing'
import type { TitleId } from '@local/shared-kernel'
import type { BookStock } from '../domain/book-stock.js'
import type { BookStockRepository } from '../domain/book-stock-repository.js'

export class InMemoryBookStockRepository
  extends InMemoryRepository<BookStock, TitleId>
  implements BookStockRepository {}
