import type { Repository } from '@local/ddd-core'
import type { MemberId } from '@local/shared-kernel'
import type { Member } from './member.js'

export type MemberRepository = Repository<Member, MemberId>
