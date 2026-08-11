export { MembershipDesk, UnknownMember } from './application/membership-desk.js'
export {
  BorrowAllowanceExceeded,
  MemberEnrolled,
  MemberReinstated,
  MemberSuspended,
} from './domain/events.js'
export type { MemberRepository } from './domain/member-repository.js'
export { ALLOWANCE_BY_TIER, MEMBER_TIERS, Member } from './domain/member.js'
export type {
  BorrowEligibility,
  MemberSnapshot,
  MemberStanding,
  MemberTier,
} from './domain/member.js'
export { InMemoryMemberRepository } from './infrastructure/in-memory-member-repository.js'
