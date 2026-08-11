import type { MemberId } from '@local/shared-kernel'
import type { HoldRequestId } from './identities.js'

/**
 * What the policy is allowed to see about one waiting member.
 *
 * Deliberately inert data rather than the `HoldRequest` entity itself. A policy
 * is a decision, not a mutation — handing it live entities would let a policy
 * quietly change the queue it is meant to be judging, and would make "which
 * policy corrupted the state?" a debugging question you cannot answer.
 */
export interface HoldCandidate {
  readonly holdRequestId: HoldRequestId
  readonly memberId: MemberId
  readonly requestedAt: Date
  readonly daysWaiting: number
}

/**
 * Whose turn is it when a copy comes back?
 *
 * Expressed as an injectable **Domain Policy** (the Strategy pattern, applied
 * to a business rule) because this genuinely varies between libraries, and
 * because it is the kind of rule a domain expert wants to change without a
 * developer rewriting an aggregate.
 *
 * A policy that needs knowledge from outside the Lending context — "is this
 * member suspended?" lives in Membership — receives it through its
 * *constructor*, gathered by the application service before the call. The
 * aggregate method itself stays pure: given a queue and a policy, the outcome
 * is deterministic and unit-testable with no repositories in sight.
 */
export interface HoldAllocationPolicy {
  /** Shown in scenario output so the transcript says which rule was applied. */
  readonly description: string

  chooseNext(candidates: readonly HoldCandidate[], now: Date): HoldCandidate | undefined
}

/**
 * First come, first served, no exceptions.
 *
 * ┌─ 👉 YOUR CALL ───────────────────────────────────────────────────────────┐
 * │ This is the default, and it is defensible: queue fairness is easy to     │
 * │ explain at the counter, and a member who waited longest getting the      │
 * │ book is a rule nobody argues with.                                       │
 * │                                                                          │
 * │ But there are real alternatives, and the choice changes behaviour:       │
 * │                                                                          │
 * │  • **Skip the ineligible** (`SkipIneligibleAllocation` below).           │
 * │    Allocating to a suspended member wastes the collection window — the   │
 * │    copy sits on the hold shelf for 48 hours and helps nobody. Cost: a    │
 * │    member can lose their place through no fault of their own.            │
 * │                                                                          │
 * │  • **Longest-wait-with-priority-tiers.** Staff or accessibility needs    │
 * │    jump the queue. Cost: you must now be able to defend that ordering    │
 * │    to the person it skipped.                                             │
 * │                                                                          │
 * │  • **Expire-aware round-robin.** A member who has already let one hold   │
 * │    lapse goes to the back. Cost: needs history this context does not     │
 * │    currently keep.                                                       │
 * │                                                                          │
 * │ Write your own: implement `HoldAllocationPolicy` — roughly 8 lines —     │
 * │ and pass it to `HoldDesk`. `hold-queue.test.ts` pins the FIFO behaviour, │
 * │ so you will see immediately which assertions your rule changes.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export class StrictFifoAllocation implements HoldAllocationPolicy {
  readonly description = 'strict first-in-first-out'

  chooseNext(candidates: readonly HoldCandidate[]): HoldCandidate | undefined {
    // `candidates` arrives in queue order, so this is simply "the front".
    // Sorting defensively anyway costs nothing and documents the intent.
    return [...candidates].sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime())[0]
  }
}

/**
 * FIFO, but pass over members who could not borrow the copy anyway.
 *
 * Provided as a worked example of the alternative. Note how the outside
 * knowledge arrives: a set of member ids, gathered by the application service
 * *before* the aggregate method runs. The domain never reaches across a context
 * border mid-decision.
 */
export class SkipIneligibleAllocation implements HoldAllocationPolicy {
  readonly description = 'first-in-first-out, skipping members who cannot borrow'

  readonly #ineligible: ReadonlySet<string>

  constructor(ineligibleMemberIds: Iterable<string>) {
    this.#ineligible = new Set(ineligibleMemberIds)
  }

  chooseNext(candidates: readonly HoldCandidate[]): HoldCandidate | undefined {
    return [...candidates]
      .sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime())
      .find((candidate) => !this.#ineligible.has(candidate.memberId.value))
  }
}
