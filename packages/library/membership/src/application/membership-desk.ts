import type { Clock } from '@local/ddd-core'
import { DomainError } from '@local/ddd-core'
import type { UnitOfWork } from '@local/event-bus'
import { MemberId } from '@local/shared-kernel'
import type { MemberRepository } from '../domain/member-repository.js'
import { Member, type BorrowEligibility, type MemberTier } from '../domain/member.js'

export class UnknownMember extends DomainError {
  constructor(memberId: string) {
    super(`no member holds card ${memberId}`)
  }
}

/**
 * Everything the enrolment desk does, plus the two reactions that keep a
 * member's loan counter in step with the Lending context.
 *
 * `recordLoanTaken` / `recordLoanReturned` are named for what they are:
 * bookkeeping in response to something that already happened somewhere else.
 * They are wired to `LoanOpened` / `LoanClosed` in the composition root — see
 * `apps/scenarios/src/wiring.ts`.
 */
export class MembershipDesk {
  readonly #members: MemberRepository
  readonly #unitOfWork: UnitOfWork
  readonly #clock: Clock

  constructor(deps: { members: MemberRepository; unitOfWork: UnitOfWork; clock: Clock }) {
    this.#members = deps.members
    this.#unitOfWork = deps.unitOfWork
    this.#clock = deps.clock
  }

  async enrol(command: { memberId: string; name: string; tier: MemberTier }): Promise<MemberId> {
    const member = Member.enrol({
      memberId: MemberId.of(command.memberId),
      name: command.name,
      tier: command.tier,
      at: this.#clock.now(),
    })

    await this.#unitOfWork.commit(this.#members, member)
    return member.id
  }

  async eligibilityToBorrow(memberId: MemberId): Promise<BorrowEligibility> {
    const member = await this.#load(memberId)
    return member.eligibilityToBorrow(this.#clock.now())
  }

  async suspend(memberId: MemberId, reason: string, until: Date): Promise<void> {
    const member = await this.#load(memberId)
    member.suspendUntil(until, reason, this.#clock.now())
    await this.#unitOfWork.commit(this.#members, member)
  }

  async reinstate(memberId: MemberId): Promise<void> {
    const member = await this.#load(memberId)
    member.reinstate(this.#clock.now())
    await this.#unitOfWork.commit(this.#members, member)
  }

  async recordLoanTaken(memberId: MemberId): Promise<void> {
    const member = await this.#load(memberId)
    member.loanTaken(this.#clock.now())
    await this.#unitOfWork.commit(this.#members, member)
  }

  async recordLoanReturned(memberId: MemberId): Promise<void> {
    const member = await this.#load(memberId)
    member.loanReturned()
    await this.#unitOfWork.commit(this.#members, member)
  }

  async #load(memberId: MemberId): Promise<Member> {
    const member = await this.#members.findById(memberId)
    if (member === undefined) throw new UnknownMember(memberId.value)
    return member
  }
}
