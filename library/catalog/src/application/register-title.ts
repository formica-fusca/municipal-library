import { InvariantViolation } from '@local/ddd-core'
import type { UnitOfWork } from '@local/event-bus'
import { Isbn, TitleId, type Clock } from '@local/shared-kernel'
import type { TitleRepository } from '../domain/title-repository.js'
import { Title } from '../domain/title.js'

export interface RegisterTitleCommand {
  readonly titleId: string
  readonly isbn: string
  readonly heading: string
  readonly author: string
  readonly publishedYear: number
}

/**
 * An application service. Note how little it does:
 *
 * 1. translate primitives from the outside world into domain types,
 * 2. load what is needed,
 * 3. call **one** method on **one** aggregate,
 * 4. commit.
 *
 * There is no business rule in this file, and there should never be one. Rules
 * that live in application services are rules that cannot be unit-tested
 * without a repository, cannot be found by a domain expert reading the model,
 * and get quietly duplicated the second a second entry point appears.
 *
 * The uniqueness check below looks like an exception, and it is worth being
 * precise about why it is not: "no two titles share an ISBN" is a rule *across
 * aggregates*. No single `Title` can enforce it, because no single `Title` can
 * see the others. Set-wide rules necessarily live at this level (or in a
 * database constraint, which is the honest place for them).
 */
export class RegisterTitle {
  readonly #titles: TitleRepository
  readonly #unitOfWork: UnitOfWork
  readonly #clock: Clock

  constructor(deps: { titles: TitleRepository; unitOfWork: UnitOfWork; clock: Clock }) {
    this.#titles = deps.titles
    this.#unitOfWork = deps.unitOfWork
    this.#clock = deps.clock
  }

  async execute(command: RegisterTitleCommand): Promise<TitleId> {
    const isbn = Isbn.of(command.isbn)

    const existing = await this.#titles.findByIsbn(isbn)
    if (existing !== undefined) {
      throw new InvariantViolation(
        'an ISBN identifies at most one catalogue title',
        `${isbn.format()} is already catalogued as "${existing.heading}"`,
      )
    }

    const title = Title.register({
      titleId: TitleId.of(command.titleId),
      isbn,
      heading: command.heading,
      author: command.author,
      publishedYear: command.publishedYear,
      at: this.#clock.now(),
    })

    await this.#unitOfWork.commit(this.#titles, title)

    return title.id
  }
}
