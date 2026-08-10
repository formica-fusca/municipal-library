import { InvariantViolation, ValueObject } from '@local/ddd-core'

interface IsbnProps {
  readonly digits: string
}

/**
 * An ISBN-13.
 *
 * The textbook Value Object, and the cheapest invariant in this codebase.
 * Because the constructor is private and the only way in is `Isbn.of()`, an
 * `Isbn` **cannot exist in an invalid state**. Every function downstream that
 * accepts an `Isbn` therefore gets validity for free: no defensive check, no
 * test, no possibility of a malformed value reaching the catalogue.
 *
 * Contrast with taking `isbn: string` everywhere, where validity is a property
 * of the *call site* and must be re-established, or re-trusted, at every hop.
 *
 * @see https://en.wikipedia.org/wiki/ISBN#ISBN-13_check_digit_calculation
 */
export class Isbn extends ValueObject<IsbnProps> {
  private constructor(props: IsbnProps) {
    super(props)
  }

  static of(raw: string): Isbn {
    const digits = raw.replace(/[\s-]/g, '')

    if (!/^\d{13}$/.test(digits)) {
      throw new InvariantViolation(
        'ISBN is thirteen digits',
        `"${raw}" normalises to "${digits}", which is not 13 digits`,
      )
    }

    if (!Isbn.hasValidCheckDigit(digits)) {
      throw new InvariantViolation(
        'ISBN check digit is correct',
        `"${raw}" fails the ISBN-13 checksum — likely a typo`,
      )
    }

    return new Isbn({ digits })
  }

  /**
   * Weights alternate 1, 3, 1, 3 … across the first twelve digits; the
   * thirteenth is chosen so the weighted total is a multiple of ten. A single
   * mistyped digit always breaks it, which is exactly what the rule is for.
   */
  private static hasValidCheckDigit(digits: string): boolean {
    let total = 0
    for (let index = 0; index < 13; index += 1) {
      const digit = Number(digits[index])
      total += index % 2 === 0 ? digit : digit * 3
    }
    return total % 10 === 0
  }

  get value(): string {
    return this.props.digits
  }

  /** Rendered the way it is printed on a book jacket. */
  format(): string {
    const d = this.props.digits
    return `${d.slice(0, 3)}-${d.slice(3, 4)}-${d.slice(4, 6)}-${d.slice(6, 12)}-${d.slice(12)}`
  }

  override toString(): string {
    return this.format()
  }
}
