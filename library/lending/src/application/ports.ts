import type { CopyId, MemberId, TitleId } from '@local/shared-kernel'

/**
 * # The anti-corruption layer
 *
 * Lending needs two things it does not own: whether a member may borrow
 * (Membership), and a volume off the shelf (Inventory). It could simply import
 * `@local/library-membership` and `@local/library-inventory` and call them.
 * It deliberately does not.
 *
 * Instead it states, here, exactly what it needs — in *its own* vocabulary —
 * and the composition root supplies adapters. See
 * `apps/scenarios/src/wiring.ts`.
 *
 * ## What this buys, concretely
 *
 * - **The dependency arrow points inward.** `package.json` for this context
 *   lists neither of the other two. `tsc -b` enforces it: an import would fail
 *   to resolve, not merely be frowned upon in review.
 * - **Foreign vocabulary stays out.** `BorrowerVerdict` below is structurally
 *   identical to Membership's `BorrowEligibility` — deliberately, so the
 *   adapter is a one-liner. But the *type* belongs to Lending. If Membership
 *   renames its type or adds a tier concept, nothing here changes.
 * - **Foreign failure modes stay out.** `lendAnyCopy` returns `undefined`
 *   rather than letting Inventory's `NoCopyAvailable` propagate. Catching
 *   another context's exception type is an import in disguise, and it makes
 *   that exception part of your public contract without anybody deciding so.
 */

export type BorrowerVerdict =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string }

export interface BorrowerDirectory {
  eligibilityToBorrow(memberId: MemberId): Promise<BorrowerVerdict>
}

export interface ShelfGateway {
  /** @returns the volume that was taken off the shelf, or `undefined` if none was. */
  lendAnyCopy(titleId: TitleId): Promise<CopyId | undefined>

  acceptReturn(titleId: TitleId, copyId: CopyId): Promise<void>

  availableCount(titleId: TitleId): Promise<number>
}

/**
 * Ids are minted outside the domain so that aggregates stay deterministic and
 * testable — no aggregate in this repository ever calls `randomUUID()` on its
 * own. The same reasoning as `Clock`: anything non-deterministic is a
 * dependency, and dependencies are declared, not reached for.
 */
export interface IdentifierFactory {
  nextLoanId(): string
  nextHoldRequestId(): string
}
