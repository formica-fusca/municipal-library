import type { Repository } from '@local/ddd-core'
import type { ProductId } from './identities.js'
import type { StockItem } from './stock-item.js'

export type StockItemRepository = Repository<StockItem, ProductId>
