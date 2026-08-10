import { Identifier } from '@local/ddd-core'

/**
 * Identities that belong to Lending alone.
 *
 * These are *not* in the shared kernel, and that is the point: no other context
 * has any business naming a loan or a hold request. Every type promoted to the
 * shared kernel is a type that two teams must now agree on before either can
 * change it, so the bar for promotion is "more than one context genuinely needs
 * to refer to this" — and nothing else does.
 */
export class LoanId extends Identifier {
  declare protected readonly _tag: 'LoanId'

  private constructor(value: string) {
    super(value)
  }

  static of(value: string): LoanId {
    return new LoanId(value)
  }
}

export class HoldRequestId extends Identifier {
  declare protected readonly _tag: 'HoldRequestId'

  private constructor(value: string) {
    super(value)
  }

  static of(value: string): HoldRequestId {
    return new HoldRequestId(value)
  }
}
