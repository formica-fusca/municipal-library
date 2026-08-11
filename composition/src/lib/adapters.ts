import type { CopyId, MemberId, TitleId } from '@local/shared-kernel'
import { NoCopyAvailable } from '@local/library-inventory'
import type { ShelfOperations } from '@local/library-inventory'
import type { MembershipDesk } from '@local/library-membership'
import type {
  BorrowerDirectory,
  BorrowerVerdict,
  IdentifierFactory,
  ShelfGateway,
} from '@local/library-lending'

/**
 * # The anti-corruption layer
 *
 * Three classes, and every one of them implements an interface that *another*
 * context declared. That is the shape of the pattern: the consumer states what
 * it needs in its own vocabulary, and the translation to whoever can actually
 * answer happens out here, where both vocabularies are allowed to be in scope
 * at once.
 *
 * None of them is exported from the package. An app that could construct a
 * `ShelfAdapter` could construct a *different* one, and then there would be two
 * answers to "how does Lending reach the shelf?" instead of one.
 */

/**
 * Lending asked for a `ShelfGateway`. Inventory offers `ShelfOperations`. This
 * class is the seam between the two vocabularies.
 *
 * The `catch` is the interesting line. Inventory signals "nothing on the shelf"
 * by throwing `NoCopyAvailable`; Lending's port says the answer is `undefined`.
 * Translating here means Lending never has to know that Inventory has an
 * exception type by that name — and catching a foreign exception type in
 * business code is an import in disguise, which quietly promotes somebody
 * else's error class into your public contract.
 */
export class ShelfAdapter implements ShelfGateway {
  readonly #shelf: ShelfOperations

  constructor(shelf: ShelfOperations) {
    this.#shelf = shelf
  }

  async lendAnyCopy(titleId: TitleId): Promise<CopyId | undefined> {
    try {
      return await this.#shelf.lendAnyCopy(titleId)
    } catch (error) {
      if (error instanceof NoCopyAvailable) return undefined
      throw error
    }
  }

  async acceptReturn(titleId: TitleId, copyId: CopyId): Promise<void> {
    await this.#shelf.acceptReturn(titleId, copyId)
  }

  async availableCount(titleId: TitleId): Promise<number> {
    return this.#shelf.availableCount(titleId)
  }
}

/**
 * Membership's `BorrowEligibility` and Lending's `BorrowerVerdict` are
 * structurally identical, so this adapter is nearly a no-op — and it is still
 * worth having. It is the single place that would change if Membership added a
 * tier concept, a fines balance, or renamed the type.
 */
export class BorrowerDirectoryAdapter implements BorrowerDirectory {
  readonly #desk: MembershipDesk

  constructor(desk: MembershipDesk) {
    this.#desk = desk
  }

  async eligibilityToBorrow(memberId: MemberId): Promise<BorrowerVerdict> {
    const eligibility = await this.#desk.eligibilityToBorrow(memberId)
    return eligibility.allowed ? { allowed: true } : { allowed: false, reason: eligibility.reason }
  }
}

/**
 * Deterministic ids, so a scenario transcript is byte-identical between runs.
 *
 * `randomUUID()` would make the output undiffable and would hide behavioural
 * changes in a wall of noise. Minting ids outside the domain also keeps
 * aggregates pure: nothing under `foundation/`, `library/` or `bookshop/`
 * reaches for a source of randomness.
 */
export class SequentialIds implements IdentifierFactory {
  #loans = 0
  #holds = 0

  nextLoanId(): string {
    this.#loans += 1
    return `LOAN-${String(this.#loans).padStart(4, '0')}`
  }

  nextHoldRequestId(): string {
    this.#holds += 1
    return `HOLD-${String(this.#holds).padStart(4, '0')}`
  }
}
