import { Entity, IllegalStateTransition } from '@local/ddd-core'
import type { MemberId, TitleId } from '@local/shared-kernel'
import { HoldCancelled, HoldExpired, HoldFulfilled } from './events.js'
import type { HoldRequestId } from './identities.js'

export const HOLD_STATUSES = ['Waiting', 'Allocated', 'Fulfilled', 'Expired', 'Cancelled'] as const
export type HoldStatus = (typeof HOLD_STATUSES)[number]

export interface HoldRequestSnapshot {
  readonly holdRequestId: string
  readonly memberId: string
  readonly status: HoldStatus
  readonly requestedAt: string
  readonly collectBy: string | null
}

/**
 * One member's place in the queue for one title.
 *
 * The second child entity in this repository, and a useful contrast with
 * `Copy`: it has identity, its own small state machine, and it is meaningless
 * outside its root. "Third in the queue" is not a property of the request — it
 * is a property of the request's *position among the others*, which only
 * `HoldQueue` can see. That is a clean tell that this belongs inside a
 * boundary rather than owning one.
 *
 * ## What it records, and why
 *
 * It records `HoldExpired`, `HoldCancelled` and `HoldFulfilled` — three facts
 * about this member's own request, which this object holds the knowledge for
 * (its own collect-by date, its own member's decision).
 *
 * It does **not** record `HoldAllocated`. Being allocated means *being chosen
 * ahead of everyone else*, and no single request can know that. The root
 * records it. This is the dividing line stated in `docs/05-domain-events.md`.
 */
export class HoldRequest extends Entity<HoldRequestId> {
  readonly #titleId: TitleId
  readonly #memberId: MemberId
  readonly #requestedAt: Date
  #status: HoldStatus
  #collectBy: Date | undefined

  private constructor(params: {
    holdRequestId: HoldRequestId
    titleId: TitleId
    memberId: MemberId
    requestedAt: Date
    status: HoldStatus
    collectBy: Date | undefined
  }) {
    super(params.holdRequestId)
    this.#titleId = params.titleId
    this.#memberId = params.memberId
    this.#requestedAt = params.requestedAt
    this.#status = params.status
    this.#collectBy = params.collectBy
  }

  static place(params: {
    holdRequestId: HoldRequestId
    titleId: TitleId
    memberId: MemberId
    at: Date
  }): HoldRequest {
    return new HoldRequest({
      holdRequestId: params.holdRequestId,
      titleId: params.titleId,
      memberId: params.memberId,
      requestedAt: params.at,
      status: 'Waiting',
      collectBy: undefined,
    })
  }

  static rehydrate(params: {
    holdRequestId: HoldRequestId
    titleId: TitleId
    memberId: MemberId
    requestedAt: Date
    status: HoldStatus
    collectBy: Date | undefined
  }): HoldRequest {
    return new HoldRequest(params)
  }

  /** Called by the root, which records the event. */
  allocate(collectBy: Date): void {
    this.#requireStatus('Allocated', 'Waiting')
    this.#status = 'Allocated'
    this.#collectBy = collectBy
  }

  expire(at: Date): void {
    this.#requireStatus('Expired', 'Allocated')
    this.#status = 'Expired'
    this.#collectBy = undefined
    this.record(
      new HoldExpired({
        titleId: this.#titleId,
        memberId: this.#memberId,
        holdRequestId: this.id,
        occurredAt: at,
      }),
    )
  }

  cancel(at: Date): void {
    this.#requireStatus('Cancelled', 'Waiting', 'Allocated')
    this.#status = 'Cancelled'
    this.#collectBy = undefined
    this.record(
      new HoldCancelled({ titleId: this.#titleId, memberId: this.#memberId, occurredAt: at }),
    )
  }

  fulfil(at: Date): void {
    this.#requireStatus('Fulfilled', 'Allocated')
    this.#status = 'Fulfilled'
    this.#collectBy = undefined
    this.record(
      new HoldFulfilled({ titleId: this.#titleId, memberId: this.#memberId, occurredAt: at }),
    )
  }

  get memberId(): MemberId {
    return this.#memberId
  }

  get status(): HoldStatus {
    return this.#status
  }

  get requestedAt(): Date {
    return new Date(this.#requestedAt)
  }

  get collectBy(): Date | undefined {
    return this.#collectBy === undefined ? undefined : new Date(this.#collectBy)
  }

  /** Waiting or Allocated — the member is still in the running. */
  get isActive(): boolean {
    return this.#status === 'Waiting' || this.#status === 'Allocated'
  }

  get isWaiting(): boolean {
    return this.#status === 'Waiting'
  }

  get isAllocated(): boolean {
    return this.#status === 'Allocated'
  }

  hasLapsedAt(now: Date): boolean {
    if (this.#status !== 'Allocated' || this.#collectBy === undefined) return false
    return now.getTime() >= this.#collectBy.getTime()
  }

  snapshot(): HoldRequestSnapshot {
    return {
      holdRequestId: this.id.value,
      memberId: this.#memberId.value,
      status: this.#status,
      requestedAt: this.#requestedAt.toISOString(),
      collectBy: this.#collectBy?.toISOString() ?? null,
    }
  }

  #requireStatus(target: HoldStatus, ...allowed: readonly HoldStatus[]): void {
    if (!allowed.includes(this.#status)) {
      throw new IllegalStateTransition(`hold ${this.id.value}`, this.#status, target)
    }
  }
}
