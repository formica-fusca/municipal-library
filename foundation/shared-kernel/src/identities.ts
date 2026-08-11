import { Identifier } from '@local/ddd-core'

/**
 * The identities that cross bounded-context borders.
 *
 * These three are in the shared kernel because more than one context must be
 * able to *refer* to the same thing. Lending records which member borrowed
 * which copy of which title; inventory records which copies exist for a title.
 * If each context minted its own incompatible id type, every integration point
 * would need a translation layer for no benefit.
 *
 * Note what is deliberately absent: `LoanId` and `HoldRequestId` live in
 * `@local/library-lending`, because no other context has any business naming a
 * loan. Keeping the shared kernel small is the whole discipline — every type
 * added here is a type that two teams must now agree on before either can
 * change it.
 */

/** A work in the catalogue — "Dune, Frank Herbert, 1965 edition". */
export class TitleId extends Identifier {
  declare protected readonly _tag: 'TitleId'

  private constructor(value: string) {
    super(value)
  }

  static of(value: string): TitleId {
    return new TitleId(value)
  }
}

/**
 * A single physical volume on a shelf, identified by the barcode sticker inside
 * its cover. Two copies of the same title have the same `TitleId` and different
 * `CopyId`s — this distinction is the reason the library model is interesting.
 */
export class CopyId extends Identifier {
  declare protected readonly _tag: 'CopyId'

  private constructor(value: string) {
    super(value)
  }

  static of(value: string): CopyId {
    return new CopyId(value)
  }
}

/** A person holding a library card. */
export class MemberId extends Identifier {
  declare protected readonly _tag: 'MemberId'

  private constructor(value: string) {
    super(value)
  }

  static of(value: string): MemberId {
    return new MemberId(value)
  }
}
