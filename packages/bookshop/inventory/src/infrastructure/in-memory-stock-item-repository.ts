import { InMemoryRepository } from '@local/ddd-core/testing'
import type { ProductId } from '../domain/identities.js'
import type { StockItemRepository } from '../domain/stock-item-repository.js'
import type { StockItem } from '../domain/stock-item.js'

export class InMemoryStockItemRepository
  extends InMemoryRepository<StockItem, ProductId>
  implements StockItemRepository {}
