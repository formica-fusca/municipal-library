import { AggregateRoot, InvariantViolation, type Entity, type Identifier } from '@local/ddd-core'
import type { CopyId, TitleId } from '@local/shared-kernel'
import type { CopyStatus } from './copy-status.js'
import { Copy, type CopySnapshot } from './copy.js'
import { CopyNotInStock, DuplicateCopy, NoCopyAvailable } from './errors.js'
import {
  CopyAcquired,
  CopyCheckedOut,
  CopyReturned,
  TitleBecameAvailable,
  TitleOutOfStock,
} from './events.js'

export interface BookStockSnapshot {
  readonly titleId: string
  /** Every `Copy` ever acquired, **including lost and withdrawn ones**. */
  readonly totalCopies: number
  /** Volumes the library still physically has, whoever is currently holding them. */
  readonly heldCount: number
  /** Volumes a member could borrow right now. */
  readonly availableCount: number
  readonly copies: readonly CopySnapshot[]
}

/**
 * The stock of one title: every physical volume the library owns of it.
 *
 * # Why this cluster is one aggregate
 *
 * Because of a single sentence: **`availableCount` must always equal the number
 * of copies whose status is `Available`.** That sentence spans the root and
 * every copy at once. It is not allowed to be true "in a moment" — a librarian
 * reading the count and a librarian reading the shelf must never disagree.
 *
 * A rule that must hold *at every instant* across several objects is the
 * definition of an aggregate boundary. That is the whole criterion. Not "these
 * things feel related", not "they're on the same screen".
 *
 * # Why the count is cached rather than recomputed
 *
 * `availableCount` is maintained incrementally, and this is a modelling
 * decision, not an optimisation. A value recomputed on every read cannot
 * possibly disagree with the copies, so it would be an invariant that cannot
 * break — and an invariant that cannot break teaches you nothing about why the
 * boundary exists. This one can drift, `assertInvariants()` catches it, and
 * `scenarios/04` breaks it on purpose to show what the boundary is buying you.
 *
 * # The rule that follows
 *
 * Nothing outside may hold a `Copy`. Every mutation goes through a method here,
 * so that the counter is adjusted in the same breath as the status. `Copy` is
 * therefore not exported from this package's `index.ts`.
 */
export class BookStock extends AggregateRoot<TitleId> {
  readonly #copies = new Map<string, Copy>()
  #availableCount = 0

  private constructor(titleId: TitleId) {
    super(titleId)
  }

  static open(titleId: TitleId): BookStock {
    return new BookStock(titleId)
  }

  static rehydrate(titleId: TitleId, copies: readonly Copy[]): BookStock {
    const stock = new BookStock(titleId)
    for (const copy of copies) {
      stock.#copies.set(copy.id.value, copy)
      if (copy.isOnShelf) stock.#availableCount += 1
    }
    stock.assertInvariants()
    return stock
  }

  /**
   * Declaring the children is what lets their recorded events escape.
   *
   * Delete this method and the model still compiles, still passes most tests,
   * and silently stops publishing every `CopyDamaged` the library ever
   * produces. `scenarios/05` demonstrates exactly that failure.
   */
  protected override childEntities(): readonly Entity<Identifier>[] {
    return [...this.#copies.values()]
  }

  // ── Commands ───────────────────────────────────────────────────────────────

  acquireCopy(copyId: CopyId, at: Date): void {
    if (this.#copies.has(copyId.value)) {
      throw new DuplicateCopy(copyId.value)
    }

    const copy = Copy.acquire({ copyId, titleId: this.id })
    this.#copies.set(copyId.value, copy)

    this.record(new CopyAcquired({ titleId: this.id, copyId, occurredAt: at }))
    this.#shiftAvailability(+1, at)

    this.assertInvariants()
  }

  /**
   * Lend whichever copy is nearest to hand.
   *
   * The caller asks for *a* copy of a title, never for a specific barcode —
   * that is what a member wants, and choosing the volume is the library's job.
   * Returning the chosen `CopyId` (a value, not the entity) is how the lending
   * context learns which volume went out without ever touching a `Copy`.
   */
  lendOutAnyCopy(at: Date): CopyId {
    const available = [...this.#copies.values()].find((copy) => copy.isOnShelf)

    if (available === undefined) {
      throw new NoCopyAvailable(this.id.value)
    }

    available.lendOut()
    this.record(new CopyCheckedOut({ titleId: this.id, copyId: available.id, occurredAt: at }))
    this.#shiftAvailability(-1, at)

    this.assertInvariants()
    return available.id
  }

  acceptReturn(copyId: CopyId, at: Date): void {
    const copy = this.#copyOrFail(copyId)

    copy.returnToShelf()
    this.record(new CopyReturned({ titleId: this.id, copyId, occurredAt: at }))
    this.#shiftAvailability(+1, at)

    this.assertInvariants()
  }

  /**
   * A copy comes back damaged, or is found damaged on the shelf.
   *
   * Notice the division of labour: the `Copy` validates the transition and
   * records `CopyDamaged` (it alone knows its condition), while this method
   * adjusts the count and may record `TitleOutOfStock` (only the root can know
   * that). Both events leave together, in causal order, when the root is
   * committed.
   */
  reportDamaged(copyId: CopyId, reason: string, at: Date): void {
    const copy = this.#copyOrFail(copyId)
    const wasOnShelf = copy.isOnShelf

    copy.reportDamaged(reason, at)

    if (wasOnShelf) this.#shiftAvailability(-1, at)
    this.assertInvariants()
  }

  repair(copyId: CopyId, at: Date): void {
    const copy = this.#copyOrFail(copyId)

    copy.repair(at)
    this.#shiftAvailability(+1, at)

    this.assertInvariants()
  }

  reportLost(copyId: CopyId, at: Date): void {
    const copy = this.#copyOrFail(copyId)
    const wasOnShelf = copy.isOnShelf

    copy.reportLost(at)

    if (wasOnShelf) this.#shiftAvailability(-1, at)
    this.assertInvariants()
  }

  withdraw(copyId: CopyId, reason: string, at: Date): void {
    const copy = this.#copyOrFail(copyId)
    const wasOnShelf = copy.isOnShelf

    copy.withdraw(reason, at)

    if (wasOnShelf) this.#shiftAvailability(-1, at)
    this.assertInvariants()
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  get availableCount(): number {
    return this.#availableCount
  }

  /**
   * Every `Copy` this stock has ever acquired, including the lost and the
   * withdrawn.
   *
   * Not "how many books do we have" — see `heldCount` for that. A terminal
   * status removes the volume from the library, never the record from the
   * aggregate: deleting it would destroy the answer to "what happened to
   * `LIB-000102`?" along with its lending history.
   */
  get totalCopies(): number {
    return this.#copies.size
  }

  /**
   * Volumes the library still physically holds — on a shelf, in a member's
   * hands, or in the repair box.
   *
   * **Derived, not stored**, unlike `#availableCount`. That asymmetry is
   * deliberate and worth reading twice: `#availableCount` is an incrementally
   * maintained counter *because this repository needs an invariant that can
   * drift* — it is the thing `assertInvariants()` exists to check and scenario
   * 4 exists to break. Adding a second stored counter would double the surface
   * that can go wrong and teach nothing new.
   *
   * The general rule is the other way round from what the caching instinct
   * suggests: if a value can be derived from state, derive it. Storing it is
   * what needs a justification.
   */
  get heldCount(): number {
    return [...this.#copies.values()].filter((copy) => copy.isHeld).length
  }

  get hasCopyAvailable(): boolean {
    return this.#availableCount > 0
  }

  countInStatus(status: CopyStatus): number {
    return [...this.#copies.values()].filter((copy) => copy.status === status).length
  }

  statusOf(copyId: CopyId): CopyStatus {
    return this.#copyOrFail(copyId).status
  }

  /** Inert data. Callers get a picture of the aggregate, never a handle on it. */
  snapshot(): BookStockSnapshot {
    return {
      titleId: this.id.value,
      totalCopies: this.#copies.size,
      heldCount: this.heldCount,
      availableCount: this.#availableCount,
      copies: [...this.#copies.values()].map((copy) => copy.snapshot()),
    }
  }

  // ── Invariants ─────────────────────────────────────────────────────────────

  override assertInvariants(): void {
    const actuallyOnShelf = [...this.#copies.values()].filter((copy) => copy.isOnShelf).length

    if (this.#availableCount !== actuallyOnShelf) {
      throw new InvariantViolation(
        'the available count matches the copies on the shelf',
        `title ${this.id.value} claims ${this.#availableCount} available, ` +
          `but ${actuallyOnShelf} copies are actually on the shelf`,
      )
    }

    if (this.#availableCount < 0) {
      throw new InvariantViolation(
        'the available count is never negative',
        `title ${this.id.value} claims ${this.#availableCount}`,
      )
    }

    for (const copy of this.#copies.values()) {
      if (!copy.titleId.equals(this.id)) {
        throw new InvariantViolation(
          'every copy in a stock belongs to that stock’s title',
          `copy ${copy.id.value} belongs to title ${copy.titleId.value}`,
        )
      }
    }
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /**
   * Move the counter and announce the *edges* that other contexts care about.
   *
   * Only two transitions are newsworthy outside this aggregate: the shelf
   * becoming non-empty, and the shelf becoming empty. Going from four copies to
   * three is nobody else's business, and publishing it would invite handlers to
   * start making decisions from a number they cannot trust to still be current.
   */
  #shiftAvailability(delta: number, at: Date): void {
    const before = this.#availableCount
    this.#availableCount += delta
    const after = this.#availableCount

    if (before === 0 && after > 0) {
      this.record(
        new TitleBecameAvailable({ titleId: this.id, availableCount: after, occurredAt: at }),
      )
    }

    if (before > 0 && after === 0) {
      this.record(new TitleOutOfStock({ titleId: this.id, occurredAt: at }))
    }
  }

  #copyOrFail(copyId: CopyId): Copy {
    const copy = this.#copies.get(copyId.value)
    if (copy === undefined) {
      throw new CopyNotInStock(copyId.value, this.id.value)
    }
    return copy
  }

  /**
   * ⚠️  **A deliberate hole in the boundary, for teaching only.**
   *
   * This hands a live child entity to a caller outside the aggregate. Doing so
   * in real code defeats the entire point of the boundary: the caller can now
   * mutate a `Copy` without the root adjusting `#availableCount`, and the
   * aggregate's central invariant breaks.
   *
   * It exists so `scenarios/04-invariants-under-attack.ts` and the browser
   * playground in `apps/docs` can demonstrate that failure for real, rather
   * than describing it in prose. Delete it and the only thing that stops
   * working is the lesson.
   */
  unsafeCopyForTeaching(copyId: CopyId): Copy {
    return this.#copyOrFail(copyId)
  }
}
