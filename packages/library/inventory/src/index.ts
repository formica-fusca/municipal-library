/**
 * The published language of the Inventory context.
 *
 * ## What is missing from this list, and why
 *
 * `Copy` is **not** exported. It is a child entity inside the `BookStock`
 * boundary, and TypeScript has no package-private modifier — so the export list
 * *is* the access modifier. Because no other package can name the type, no
 * other package can hold one, and the aggregate's invariant cannot be bypassed
 * from outside. `CopySnapshot` is exported instead: inert data, safe to pass
 * around, impossible to mutate anything with.
 *
 * The same reasoning is why `BookStock`'s children are reachable only through
 * methods on the root.
 */
export { AcquireCopy } from './application/acquire-copy.js'
export type { AcquireCopyCommand } from './application/acquire-copy.js'
export { ShelfOperations } from './application/shelf-operations.js'
export { BookStock } from './domain/book-stock.js'
export type { BookStockSnapshot } from './domain/book-stock.js'
export type { BookStockRepository } from './domain/book-stock-repository.js'
export { COPY_STATUSES, LEGAL_TRANSITIONS } from './domain/copy-status.js'
export type { CopyStatus } from './domain/copy-status.js'
export type { CopySnapshot } from './domain/copy.js'
export { CopyNotInStock, DuplicateCopy, NoCopyAvailable } from './domain/errors.js'
export {
  CopyAcquired,
  CopyCheckedOut,
  CopyDamaged,
  CopyLost,
  CopyRepaired,
  CopyReturned,
  CopyWithdrawn,
  TitleBecameAvailable,
  TitleOutOfStock,
} from './domain/events.js'
export { InMemoryBookStockRepository } from './infrastructure/in-memory-book-stock-repository.js'
