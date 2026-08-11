import { InMemoryRepository } from '@local/ddd-core/testing'
import type { MemberId } from '@local/shared-kernel'
import type { MemberRepository } from '../domain/member-repository.js'
import type { Member } from '../domain/member.js'

export class InMemoryMemberRepository
  extends InMemoryRepository<Member, MemberId>
  implements MemberRepository {}
