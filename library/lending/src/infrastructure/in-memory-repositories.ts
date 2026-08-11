import { InMemoryRepository } from '@local/ddd-core/testing'
import type { CopyId, MemberId, TitleId } from '@local/shared-kernel'
import type { HoldQueue } from '../domain/hold-queue.js'
import type { LoanId } from '../domain/identities.js'
import type { Loan } from '../domain/loan.js'
import type { HoldQueueRepository, LoanRepository } from '../domain/repositories.js'

export class InMemoryLoanRepository
  extends InMemoryRepository<Loan, LoanId>
  implements LoanRepository
{
  async findOpenLoanForCopy(copyId: CopyId): Promise<Loan | undefined> {
    for (const loan of this.store.values()) {
      if (loan.isOpen && loan.copyId.equals(copyId)) return loan
    }
    return undefined
  }

  async findOpenLoansForMember(memberId: MemberId): Promise<readonly Loan[]> {
    return [...this.store.values()].filter((loan) => loan.isOpen && loan.memberId.equals(memberId))
  }

  async findAllOpen(): Promise<readonly Loan[]> {
    return [...this.store.values()].filter((loan) => loan.isOpen)
  }
}

export class InMemoryHoldQueueRepository
  extends InMemoryRepository<HoldQueue, TitleId>
  implements HoldQueueRepository
{
  async findAll(): Promise<readonly HoldQueue[]> {
    return [...this.store.values()]
  }
}
