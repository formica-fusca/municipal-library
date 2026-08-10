import type { Repository } from '@local/ddd-core'
import type { TitleId } from '@local/shared-kernel'
import type { BookStock } from './book-stock.js'

/**
 * One repository, for the aggregate root only.
 *
 * There is deliberately no `CopyRepository` anywhere in this package. Adding
 * one would let a caller load a single copy, change its status and save it,
 * with `BookStock` never getting the chance to adjust its counter — which is
 * the aggregate's central invariant. The absence of that interface is a design
 * decision, not an omission.
 */
export type BookStockRepository = Repository<BookStock, TitleId>
