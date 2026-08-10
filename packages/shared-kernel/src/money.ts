import { InvariantViolation, ValueObject } from '@local/ddd-core'

export type Currency = 'EUR'

interface MoneyProps {
  readonly cents: number
  readonly currency: Currency
}

/**
 * An amount of money, stored in whole cents.
 *
 * Two modelling decisions worth noticing:
 *
 * - **Integer cents, never floats.** `0.1 + 0.2 !== 0.3` in IEEE-754, and a
 *   bookshop that loses a cent per transaction is a bookshop with a bug the
 *   accountant finds before the developer does.
 * - **Currency travels with the amount.** `add()` refuses to combine
 *   currencies. A bare `number` cannot refuse anything; that refusal is the
 *   entire reason this class exists.
 *
 * Only the bookshop uses this. The library lends for free — which is itself a
 * modelling statement, and the reason `Money` never appears in the lending
 * context.
 */
export class Money extends ValueObject<MoneyProps> {
  private constructor(props: MoneyProps) {
    super(props)
  }

  static cents(cents: number, currency: Currency = 'EUR'): Money {
    if (!Number.isInteger(cents)) {
      throw new InvariantViolation('money is a whole number of cents', `received ${cents}`)
    }
    if (cents < 0) {
      throw new InvariantViolation('money is not negative', `received ${cents} cents`)
    }
    return new Money({ cents, currency })
  }

  static euros(euros: number, currency: Currency = 'EUR'): Money {
    return Money.cents(Math.round(euros * 100), currency)
  }

  static zero(currency: Currency = 'EUR'): Money {
    return Money.cents(0, currency)
  }

  get cents(): number {
    return this.props.cents
  }

  get currency(): Currency {
    return this.props.currency
  }

  add(other: Money): Money {
    this.assertSameCurrency(other)
    return Money.cents(this.props.cents + other.props.cents, this.props.currency)
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other)
    return Money.cents(this.props.cents - other.props.cents, this.props.currency)
  }

  times(quantity: number): Money {
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new InvariantViolation(
        'money is multiplied by a whole non-negative quantity',
        `received ${quantity}`,
      )
    }
    return Money.cents(this.props.cents * quantity, this.props.currency)
  }

  private assertSameCurrency(other: Money): void {
    if (other.props.currency !== this.props.currency) {
      throw new InvariantViolation(
        'money is only combined within one currency',
        `cannot combine ${this.props.currency} with ${other.props.currency}`,
      )
    }
  }

  format(): string {
    return `${(this.props.cents / 100).toFixed(2)} ${this.props.currency}`
  }

  override toString(): string {
    return this.format()
  }
}
