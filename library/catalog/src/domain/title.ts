import { AggregateRoot, InvariantViolation } from '@local/ddd-core'
import type { Isbn, TitleId } from '@local/shared-kernel'
import { TitleRegistered, TitleWithdrawnFromCatalogue } from './events.js'

export interface TitleSnapshot {
  readonly titleId: string
  readonly isbn: string
  readonly heading: string
  readonly author: string
  readonly publishedYear: number
  readonly inCatalogue: boolean
}

/**
 * A bibliographic record: the *work*, not any particular volume of it.
 *
 * ## The ubiquitous language decision behind this class
 *
 * The word "book" is banned in this codebase, because a librarian uses it for
 * two different things — "we have that book" (the work) and "this book is
 * damaged" (the volume in your hand). Modelling both as one class is how you
 * get a system where nobody can say whether `book.damaged` means the edition is
 * out of print or a specific volume has a torn spine.
 *
 * So: a **Title** is catalogued here. A **Copy** is a physical volume, and
 * lives in `@local/library-inventory`. They are different aggregates in
 * different contexts, connected only by `TitleId`.
 *
 * ## Why this is an Aggregate Root with no children
 *
 * It has no cluster to protect — its invariants are all about its own fields.
 * That is fine and common. Being an Aggregate Root is not a status symbol; it
 * means "this is the thing a repository loads and saves", and reference data
 * needs that just as much as a rich behavioural cluster does.
 */
export class Title extends AggregateRoot<TitleId> {
  readonly #isbn: Isbn
  #heading: string
  #author: string
  #publishedYear: number
  #inCatalogue: boolean

  private constructor(params: {
    titleId: TitleId
    isbn: Isbn
    heading: string
    author: string
    publishedYear: number
    inCatalogue: boolean
  }) {
    super(params.titleId)
    this.#isbn = params.isbn
    this.#heading = params.heading
    this.#author = params.author
    this.#publishedYear = params.publishedYear
    this.#inCatalogue = params.inCatalogue
  }

  /**
   * The named constructor is the *only* way a Title comes into existence, and
   * it records the fact. Compare with `rehydrate()` below: reconstructing an
   * aggregate from storage must not re-announce something that happened years
   * ago.
   */
  static register(params: {
    titleId: TitleId
    isbn: Isbn
    heading: string
    author: string
    publishedYear: number
    at: Date
  }): Title {
    const title = new Title({
      titleId: params.titleId,
      isbn: params.isbn,
      heading: params.heading.trim(),
      author: params.author.trim(),
      publishedYear: params.publishedYear,
      inCatalogue: true,
    })

    title.assertInvariants()
    title.record(
      new TitleRegistered({
        titleId: params.titleId,
        isbn: params.isbn,
        heading: title.#heading,
        occurredAt: params.at,
      }),
    )

    return title
  }

  /** Reconstruction from storage. Deliberately records nothing. */
  static rehydrate(snapshot: {
    titleId: TitleId
    isbn: Isbn
    heading: string
    author: string
    publishedYear: number
    inCatalogue: boolean
  }): Title {
    return new Title(snapshot)
  }

  withdrawFromCatalogue(reason: string, at: Date): void {
    if (!this.#inCatalogue) {
      throw new InvariantViolation(
        'a title is withdrawn from the catalogue at most once',
        `"${this.#heading}" is already withdrawn`,
      )
    }
    this.#inCatalogue = false
    this.assertInvariants()
    this.record(new TitleWithdrawnFromCatalogue({ titleId: this.id, reason, occurredAt: at }))
  }

  override assertInvariants(): void {
    if (this.#heading.length === 0) {
      throw new InvariantViolation('a title has a heading', `title ${this.id.value} has none`)
    }
    if (this.#author.length === 0) {
      throw new InvariantViolation('a title has an author', `"${this.#heading}" has none`)
    }
    if (!Number.isInteger(this.#publishedYear) || this.#publishedYear < 1450) {
      throw new InvariantViolation(
        'a title is published after the printing press',
        `"${this.#heading}" claims ${this.#publishedYear}`,
      )
    }
  }

  get isbn(): Isbn {
    return this.#isbn
  }

  get heading(): string {
    return this.#heading
  }

  get author(): string {
    return this.#author
  }

  get inCatalogue(): boolean {
    return this.#inCatalogue
  }

  /** A plain, inert view for read models, logs and assertions. */
  snapshot(): TitleSnapshot {
    return {
      titleId: this.id.value,
      isbn: this.#isbn.value,
      heading: this.#heading,
      author: this.#author,
      publishedYear: this.#publishedYear,
      inCatalogue: this.#inCatalogue,
    }
  }

  describe(): string {
    return `${this.#heading} — ${this.#author} (${this.#publishedYear})`
  }
}
