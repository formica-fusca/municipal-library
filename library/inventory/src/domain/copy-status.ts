export const COPY_STATUSES = ['Available', 'OnLoan', 'Damaged', 'Lost', 'Withdrawn'] as const

export type CopyStatus = (typeof COPY_STATUSES)[number]

/**
 * The lifecycle of a physical volume, written down as data rather than buried
 * in a chain of `if` statements.
 *
 * Having the table in one place means the rule can be *read* — a librarian can
 * check it — and means the entity's transition methods are three lines each
 * instead of thirty. Note the two terminal states: a volume that is lost or
 * withdrawn never comes back. If it turns up in a returns box, the correct
 * answer is a new acquisition with a new barcode, not a resurrection, because
 * the library's audit trail must keep saying that the old one was lost.
 */
export const LEGAL_TRANSITIONS: Readonly<Record<CopyStatus, readonly CopyStatus[]>> = {
  Available: ['OnLoan', 'Damaged', 'Withdrawn'],
  OnLoan: ['Available', 'Damaged', 'Lost'],
  Damaged: ['Available', 'Withdrawn'],
  Lost: [],
  Withdrawn: [],
}

export const isLegalTransition = (from: CopyStatus, to: CopyStatus): boolean =>
  LEGAL_TRANSITIONS[from].includes(to)

/** Only this status counts towards availability — the single source of truth. */
export const countsAsAvailable = (status: CopyStatus): boolean => status === 'Available'

/**
 * Whether the library still physically holds this volume — the single source of
 * truth for "how many do we actually have?", as `countsAsAvailable` is for
 * "how many can be borrowed right now?".
 *
 * `Lost` and `Withdrawn` are the two states in which the **record outlives the
 * object**. The volume is gone; its `Copy` stays, because the audit trail must
 * keep saying what happened to it. Everything else — on the shelf, in a
 * member's hands, in the repair box — is a volume the library still has.
 *
 * ## Why a switch and not `status !== 'Lost' && status !== 'Withdrawn'`
 *
 * Because this function has no safe default. A new `CopyStatus` could belong on
 * either side — `Archived` is held, `Destroyed` is not — and both a denylist
 * and an allowlist would silently guess. Written exhaustively, with the return
 * type annotated and no `default` clause, adding a status to `COPY_STATUSES`
 * makes this a compile error until somebody decides which it is.
 *
 * `countsAsAvailable` needs no such treatment: "Available" is one named state,
 * and a status nobody has invented yet is self-evidently not it. The difference
 * is that *this* function partitions the whole set.
 */
export const countsAsHeld = (status: CopyStatus): boolean => {
  switch (status) {
    case 'Available':
    case 'OnLoan':
    case 'Damaged':
      return true
    case 'Lost':
    case 'Withdrawn':
      return false
  }
}
