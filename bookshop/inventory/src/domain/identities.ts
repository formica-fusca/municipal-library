import { Identifier } from '@local/ddd-core'

/**
 * What the shop calls a line of stock.
 *
 * Note that it is *not* `TitleId`. The shop and the library both sell/lend
 * "Dune", and they share the `Isbn` that names the work — but the shop's notion
 * of a stock line (this edition, this cover price, this supplier) is its own,
 * and giving it the library's identifier would quietly assert that the two
 * contexts mean the same thing by it. They do not.
 *
 * The ISBN is the translation point between the two models. That is exactly
 * what a shared kernel is for.
 */
export class ProductId extends Identifier {
  declare protected readonly _tag: 'ProductId'

  private constructor(value: string) {
    super(value)
  }

  static of(value: string): ProductId {
    return new ProductId(value)
  }
}
