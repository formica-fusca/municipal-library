import { BorrowAllowanceExceeded, Member } from '@local/library-membership'
import { MemberId } from '@local/shared-kernel'
import { describe, expect, it } from 'vitest'

const AT = new Date('2026-03-02T09:00:00Z')
const LATER = new Date('2026-06-02T09:00:00Z')

const enrol = (tier: 'Child' | 'Adult' | 'Staff') =>
  Member.enrol({ memberId: MemberId.of('CARD-0001'), name: 'Alice', tier, at: AT })

describe('Member', () => {
  describe('eligibility is a policy, not an invariant', () => {
    it('refuses once the allowance is reached', () => {
      const member = enrol('Child') // allowance 3

      for (let i = 0; i < 3; i += 1) {
        expect(member.eligibilityToBorrow(AT).allowed).toBe(true)
        member.loanTaken(AT)
      }

      const verdict = member.eligibilityToBorrow(AT)
      expect(verdict.allowed).toBe(false)
      expect(verdict.allowed === false && verdict.reason).toMatch(/3 of 3/)
    })

    it('refuses a suspended member, and stops refusing when the suspension lapses', () => {
      const member = enrol('Adult')
      member.suspendUntil(new Date('2026-04-01T00:00:00Z'), 'unreturned volumes', AT)

      expect(member.eligibilityToBorrow(AT).allowed).toBe(false)

      // Nobody runs a job to lift it. The passage of time is not an event.
      expect(member.eligibilityToBorrow(LATER).allowed).toBe(true)
    })
  })

  describe('the counter is repaired after the fact, so it must never refuse', () => {
    it('accepts a loan that pushes it past the allowance, and says so', () => {
      const member = enrol('Child')
      for (let i = 0; i < 3; i += 1) member.loanTaken(AT)
      member.pullDomainEvents()

      // This models a race: two borrows both passed eligibility before either
      // committed. The loan already exists — throwing here would leave the
      // member record permanently disagreeing with reality.
      expect(() => member.loanTaken(AT)).not.toThrow()
      expect(member.activeLoans).toBe(4)

      const published = member.pullDomainEvents()
      expect(published.map((event) => event.name)).toEqual([
        BorrowAllowanceExceeded.eventName,
      ])
    })

    it('does not assert the allowance as an invariant', () => {
      const member = enrol('Child')
      for (let i = 0; i < 5; i += 1) member.loanTaken(AT)

      // Over the allowance, and still a perfectly valid aggregate. The rule
      // spans Member and every Loan, so Member cannot promise it.
      expect(() => member.assertInvariants()).not.toThrow()
    })

    it('does assert what it genuinely owns', () => {
      const member = enrol('Adult')
      expect(() => member.loanReturned()).toThrowError(/negative number of loans/)
    })
  })

  describe('standing', () => {
    it('refuses to reinstate a member who is not suspended', () => {
      const member = enrol('Adult')
      expect(() => member.reinstate(AT)).toThrowError(/only a suspended member/)
    })

    it('clears the suspension date on reinstatement', () => {
      const member = enrol('Adult')
      member.suspendUntil(LATER, 'fines', AT)
      member.reinstate(AT)

      expect(member.standing).toBe('Active')
      expect(() => member.assertInvariants()).not.toThrow()
      expect(member.eligibilityToBorrow(AT).allowed).toBe(true)
    })
  })
})
