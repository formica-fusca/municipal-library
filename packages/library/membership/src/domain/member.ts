import { AggregateRoot, InvariantViolation } from '@local/ddd-core'
import type { MemberId } from '@local/shared-kernel'
import {
  BorrowAllowanceExceeded,
  MemberEnrolled,
  MemberReinstated,
  MemberSuspended,
} from './events.js'

export const MEMBER_TIERS = ['Child', 'Adult', 'Staff'] as const
export type MemberTier = (typeof MEMBER_TIERS)[number]

/** How many volumes a card of each kind may have out at once. */
export const ALLOWANCE_BY_TIER: Readonly<Record<MemberTier, number>> = {
  Child: 3,
  Adult: 8,
  Staff: 20,
}

export type MemberStanding = 'Active' | 'Suspended'

/**
 * The answer to "may this person borrow right now?", carrying its reason.
 *
 * A bare `boolean` would be a worse model: the caller invariably needs to tell
 * the member *why* not, and reconstructing the reason at the call site means
 * duplicating the rule. Returning the verdict together with its justification
 * keeps the rule in exactly one place.
 */
export type BorrowEligibility =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string }

export interface MemberSnapshot {
  readonly memberId: string
  readonly memberName: string
  readonly tier: MemberTier
  readonly standing: MemberStanding
  readonly activeLoans: number
  readonly allowance: number
}

/**
 * A person holding a library card.
 *
 * # The most important thing in this file is a rule that is *absent*
 *
 * "A member may hold at most `allowance` loans at once" is **not** an invariant
 * of this aggregate, and `assertInvariants()` deliberately does not check it.
 *
 * Why not? An invariant is a statement that is true at *every instant*, and an
 * aggregate can only guarantee that for state it owns entirely. This rule spans
 * `Member` and every one of their `Loan`s. To enforce it atomically you would
 * have to put all of them inside one aggregate — and then every borrow in the
 * library would have to take a lock on the member's entire loan history, and
 * two members could never borrow concurrently without contention on a shared
 * root.
 *
 * So it is modelled as what it actually is: a **policy, checked at decision
 * time** by `eligibilityToBorrow()`, with the counter repaired *afterwards* by
 * an event handler reacting to `LoanOpened`. The window between the check and
 * the repair is real, and the model says so out loud by raising
 * `BorrowAllowanceExceeded` when it is crossed.
 *
 * This is the difference between an invariant and a business rule, and getting
 * it wrong is the single most common cause of aggregates that are too big.
 *
 * See `docs/04-invariants.md`.
 */
export class Member extends AggregateRoot<MemberId> {
  #name: string
  #tier: MemberTier
  #standing: MemberStanding
  #suspendedUntil: Date | undefined
  #activeLoans: number

  private constructor(params: {
    memberId: MemberId
    name: string
    tier: MemberTier
    standing: MemberStanding
    suspendedUntil: Date | undefined
    activeLoans: number
  }) {
    super(params.memberId)
    this.#name = params.name
    this.#tier = params.tier
    this.#standing = params.standing
    this.#suspendedUntil = params.suspendedUntil
    this.#activeLoans = params.activeLoans
  }

  static enrol(params: {
    memberId: MemberId
    name: string
    tier: MemberTier
    at: Date
  }): Member {
    const member = new Member({
      memberId: params.memberId,
      name: params.name.trim(),
      tier: params.tier,
      standing: 'Active',
      suspendedUntil: undefined,
      activeLoans: 0,
    })

    member.assertInvariants()
    member.record(
      new MemberEnrolled({
        memberId: params.memberId,
        memberName: member.#name,
        tier: params.tier,
        occurredAt: params.at,
      }),
    )

    return member
  }

  static rehydrate(params: {
    memberId: MemberId
    name: string
    tier: MemberTier
    standing: MemberStanding
    suspendedUntil: Date | undefined
    activeLoans: number
  }): Member {
    return new Member(params)
  }

  // ── The borrowing policy ───────────────────────────────────────────────────

  /**
   * May this member take another volume out, as far as *this* aggregate can
   * tell, right now?
   *
   * Read the qualifier carefully. This is the best answer available from the
   * member's own state at this instant; it is not a guarantee that will still
   * hold by the time the loan is committed. Treating it as a guarantee is how
   * people convince themselves they have transactional consistency when they do
   * not.
   */
  eligibilityToBorrow(now: Date): BorrowEligibility {
    if (this.isSuspendedAt(now)) {
      const until = this.#suspendedUntil?.toISOString().slice(0, 10) ?? 'further notice'
      return { allowed: false, reason: `${this.#name} is suspended until ${until}` }
    }

    if (this.#activeLoans >= this.allowance) {
      return {
        allowed: false,
        reason: `${this.#name} already holds ${this.#activeLoans} of ${this.allowance} permitted volumes`,
      }
    }

    return { allowed: true }
  }

  /**
   * A suspension lapses on its own date. Nobody has to run a job to lift it,
   * and there is no `Reinstated` event when it expires — because nothing
   * happened. The passage of time is not a domain event.
   */
  isSuspendedAt(now: Date): boolean {
    if (this.#standing !== 'Suspended') return false
    if (this.#suspendedUntil === undefined) return true
    return now.getTime() < this.#suspendedUntil.getTime()
  }

  // ── Reactions to what happened elsewhere ───────────────────────────────────

  /**
   * Record that a loan was opened for this member.
   *
   * Called by an event handler reacting to `LoanOpened` in the Lending context
   * — never by the borrow use case directly. The distinction matters: this
   * method describes something that has *already happened*, so it cannot
   * refuse. Throwing here would be asserting that a committed fact is illegal,
   * which leaves the two aggregates permanently disagreeing about reality.
   *
   * ┌─ 👉 YOUR CALL ─────────────────────────────────────────────────────────┐
   * │ Three defensible answers to "the counter just passed the allowance":   │
   * │                                                                        │
   * │  (a) record `BorrowAllowanceExceeded` and carry on   ← implemented     │
   * │      Honest. The overshoot is visible, a librarian can act on it,      │
   * │      and the model never lies about how many volumes are out.          │
   * │                                                                        │
   * │  (b) throw                                                             │
   * │      Tempting, and wrong here: the loan already exists. The member     │
   * │      record would now permanently under-count, and the volume would    │
   * │      be out with nothing tracking it.                                  │
   * │                                                                        │
   * │  (c) also auto-suspend the member                                      │
   * │      Defensible if repeated overshoot signals abuse — but it turns a   │
   * │      race condition into a punishment, which is hard to explain to     │
   * │      the person at the counter.                                        │
   * │                                                                        │
   * │ Swap in your own rule here. `member.test.ts` pins the current one.     │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  loanTaken(at: Date): void {
    this.#activeLoans += 1

    if (this.#activeLoans > this.allowance) {
      this.record(
        new BorrowAllowanceExceeded({
          memberId: this.id,
          activeLoans: this.#activeLoans,
          allowance: this.allowance,
          occurredAt: at,
        }),
      )
    }

    this.assertInvariants()
  }

  loanReturned(): void {
    if (this.#activeLoans === 0) {
      throw new InvariantViolation(
        'a member never has a negative number of loans',
        `${this.#name} has no active loan to return`,
      )
    }
    this.#activeLoans -= 1
    this.assertInvariants()
  }

  // ── Standing ───────────────────────────────────────────────────────────────

  suspendUntil(until: Date, reason: string, at: Date): void {
    this.#standing = 'Suspended'
    this.#suspendedUntil = until
    this.assertInvariants()
    this.record(new MemberSuspended({ memberId: this.id, reason, until, occurredAt: at }))
  }

  reinstate(at: Date): void {
    if (this.#standing === 'Active') {
      throw new InvariantViolation(
        'only a suspended member is reinstated',
        `${this.#name} is already in good standing`,
      )
    }
    this.#standing = 'Active'
    this.#suspendedUntil = undefined
    this.assertInvariants()
    this.record(new MemberReinstated({ memberId: this.id, occurredAt: at }))
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  get memberName(): string {
    return this.#name
  }

  get tier(): MemberTier {
    return this.#tier
  }

  get allowance(): number {
    return ALLOWANCE_BY_TIER[this.#tier]
  }

  get activeLoans(): number {
    return this.#activeLoans
  }

  get standing(): MemberStanding {
    return this.#standing
  }

  snapshot(): MemberSnapshot {
    return {
      memberId: this.id.value,
      memberName: this.#name,
      tier: this.#tier,
      standing: this.#standing,
      activeLoans: this.#activeLoans,
      allowance: this.allowance,
    }
  }

  /**
   * Only what this aggregate can actually guarantee on its own.
   *
   * Note what is *not* here: `activeLoans <= allowance`. See the class comment
   * — that rule spans aggregates, so asserting it here would turn a normal race
   * into a crash, and would be a promise this object has no power to keep.
   */
  override assertInvariants(): void {
    if (this.#name.length === 0) {
      throw new InvariantViolation('a member has a name', `member ${this.id.value} has none`)
    }
    if (this.#activeLoans < 0) {
      throw new InvariantViolation(
        'a member never has a negative number of loans',
        `${this.#name} has ${this.#activeLoans}`,
      )
    }
    if (this.#standing === 'Active' && this.#suspendedUntil !== undefined) {
      throw new InvariantViolation(
        'a member in good standing has no suspension end date',
        `${this.#name} is Active but suspended until ${this.#suspendedUntil.toISOString()}`,
      )
    }
  }
}
