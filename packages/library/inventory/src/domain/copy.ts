import { Entity, IllegalStateTransition } from '@local/ddd-core'
import type { CopyId, TitleId } from '@local/shared-kernel'
import {
  countsAsAvailable,
  countsAsHeld,
  isLegalTransition,
  type CopyStatus,
} from './copy-status.js'
import { CopyDamaged, CopyLost, CopyRepaired, CopyWithdrawn } from './events.js'

export interface CopySnapshot {
  readonly copyId: string
  readonly titleId: string
  readonly status: CopyStatus
  readonly timesLent: number
}

/**
 * One physical volume on a shelf, identified by the barcode inside its cover.
 *
 * ## Why this is an Entity and not a Value Object
 *
 * Its attributes change — it gets lent, damaged, repaired — and it stays the
 * same volume throughout. And the library must be able to say *which* volume:
 * "the copy you have at home" is a meaningful phrase, and would be meaningless
 * if copies were interchangeable. Identity carries the meaning; the attributes
 * merely describe the current moment.
 *
 * ## Why this is not an Aggregate Root
 *
 * Because it is not the unit of consistency. The rule the library actually
 * cares about — *how many copies of this title can be lent right now* — is a
 * statement about the whole set of copies, and no single copy can enforce it.
 * If `Copy` were a root with its own repository, two concurrent requests could
 * each load a different copy, each mark it lent, and each save happily, while
 * the count on the shelf silently went wrong.
 *
 * So: `Copy` has identity, behaviour, and its own rules (the status state
 * machine), and it is still *inside* somebody else's boundary. That combination
 * is the thing people usually find confusing, and it is the normal case.
 *
 * ## Visibility
 *
 * Every method here is `public`, because `BookStock` must be able to call them.
 * TypeScript has no "package-private". The boundary is therefore held by the
 * **export list** — this class is not exported from the package's `index.ts`,
 * so no other context can name its type, let alone hold one.
 */
export class Copy extends Entity<CopyId> {
  readonly #titleId: TitleId
  #status: CopyStatus
  #timesLent: number

  private constructor(params: {
    copyId: CopyId
    titleId: TitleId
    status: CopyStatus
    timesLent: number
  }) {
    super(params.copyId)
    this.#titleId = params.titleId
    this.#status = params.status
    this.#timesLent = params.timesLent
  }

  /**
   * A new volume arrives from the supplier.
   *
   * Records nothing: the fact that stock grew is a statement about the
   * *aggregate*, so `BookStock` announces it. See `events.ts`.
   */
  static acquire(params: { copyId: CopyId; titleId: TitleId }): Copy {
    return new Copy({
      copyId: params.copyId,
      titleId: params.titleId,
      status: 'Available',
      timesLent: 0,
    })
  }

  static rehydrate(params: {
    copyId: CopyId
    titleId: TitleId
    status: CopyStatus
    timesLent: number
  }): Copy {
    return new Copy(params)
  }

  get status(): CopyStatus {
    return this.#status
  }

  get titleId(): TitleId {
    return this.#titleId
  }

  get isOnShelf(): boolean {
    return countsAsAvailable(this.#status)
  }

  /**
   * Whether the library still has this volume at all.
   *
   * Strictly weaker than `isOnShelf`: a volume in a member's hands or in the
   * repair box is held but not available. Only `Lost` and `Withdrawn` are
   * neither.
   */
  get isHeld(): boolean {
    return countsAsHeld(this.#status)
  }

  get timesLent(): number {
    return this.#timesLent
  }

  // ── Transitions the root narrates ──────────────────────────────────────────
  //
  // These record nothing. Which copy gets lent is the *root's* decision, so the
  // root is the author of that fact and records `CopyCheckedOut` itself.

  lendOut(): void {
    this.#transitionTo('OnLoan')
    this.#timesLent += 1
  }

  returnToShelf(): void {
    this.#transitionTo('Available')
  }

  // ── Transitions the copy narrates ──────────────────────────────────────────
  //
  // These record events, because the knowledge they carry belongs to this
  // volume and nowhere else: its condition. `BookStock` cannot describe a torn
  // spine; it can only count what a torn spine implies.

  reportDamaged(reason: string, at: Date): void {
    this.#transitionTo('Damaged')
    this.record(new CopyDamaged({ titleId: this.#titleId, copyId: this.id, reason, occurredAt: at }))
  }

  repair(at: Date): void {
    this.#transitionTo('Available')
    this.record(new CopyRepaired({ titleId: this.#titleId, copyId: this.id, occurredAt: at }))
  }

  reportLost(at: Date): void {
    this.#transitionTo('Lost')
    this.record(new CopyLost({ titleId: this.#titleId, copyId: this.id, occurredAt: at }))
  }

  withdraw(reason: string, at: Date): void {
    this.#transitionTo('Withdrawn')
    this.record(
      new CopyWithdrawn({ titleId: this.#titleId, copyId: this.id, reason, occurredAt: at }),
    )
  }

  /**
   * The entity's own invariant, and the only one it can enforce alone: its
   * lifecycle is a state machine, and illegal edges are refused.
   *
   * Notice this is a *local* rule. It needs no knowledge of any other copy,
   * which is exactly why it belongs here rather than on the root.
   */
  #transitionTo(next: CopyStatus): void {
    if (!isLegalTransition(this.#status, next)) {
      throw new IllegalStateTransition(`copy ${this.id.value}`, this.#status, next)
    }
    this.#status = next
  }

  snapshot(): CopySnapshot {
    return {
      copyId: this.id.value,
      titleId: this.#titleId.value,
      status: this.#status,
      timesLent: this.#timesLent,
    }
  }
}
