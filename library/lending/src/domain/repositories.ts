import type { Repository } from '@local/ddd-core'
import type { CopyId, MemberId, TitleId } from '@local/shared-kernel'
import type { HoldQueue } from './hold-queue.js'
import type { LoanId } from './identities.js'
import type { Loan } from './loan.js'

export interface LoanRepository extends Repository<Loan, LoanId> {
  /**
   * Which loan has this volume out?
   *
   * Phrased around the *copy* rather than the member because that is what the
   * librarian has in hand at the return desk: a barcode. Repository methods
   * should read like the questions people actually ask.
   */
  findOpenLoanForCopy(copyId: CopyId): Promise<Loan | undefined>
  findOpenLoansForMember(memberId: MemberId): Promise<readonly Loan[]>
  findAllOpen(): Promise<readonly Loan[]>
}

export interface HoldQueueRepository extends Repository<HoldQueue, TitleId> {
  findAll(): Promise<readonly HoldQueue[]>
}
