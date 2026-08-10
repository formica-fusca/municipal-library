import { Isbn, MemberId, Money, TitleId } from '@local/shared-kernel'
import { describe, expect, it } from 'vitest'

describe('Isbn — an invariant enforced by the type existing', () => {
  it('accepts a valid ISBN-13 in any common formatting', () => {
    expect(Isbn.of('9780441013593').value).toBe('9780441013593')
    expect(Isbn.of('978-0-441-01359-3').value).toBe('9780441013593')
    expect(Isbn.of('978 0 441 01359 3').value).toBe('9780441013593')
  })

  it('refuses a bad check digit — the point of having a check digit', () => {
    expect(() => Isbn.of('9780441013594')).toThrowError(/check digit/)
  })

  it('refuses anything that is not thirteen digits', () => {
    expect(() => Isbn.of('044101359X')).toThrowError(/thirteen digits/)
    expect(() => Isbn.of('')).toThrowError(/thirteen digits/)
  })

  it('is equal by value', () => {
    expect(Isbn.of('9780441013593').equals(Isbn.of('978-0-441-01359-3'))).toBe(true)
  })
})

describe('Money', () => {
  it('stores whole cents and refuses floats', () => {
    expect(Money.euros(9.9).cents).toBe(990)
    expect(() => Money.cents(12.5)).toThrowError(/whole number of cents/)
  })

  it('does not lose a cent to floating point', () => {
    const total = Money.euros(0.1).add(Money.euros(0.2))
    expect(total.cents).toBe(30)
    expect(total.format()).toBe('0.30 EUR')
  })

  it('refuses a negative amount', () => {
    expect(() => Money.cents(-1)).toThrowError(/not negative/)
    expect(() => Money.euros(5).subtract(Money.euros(9))).toThrowError(/not negative/)
  })
})

describe('Identities are nominal, not structural', () => {
  it('treats the same string as different identities', () => {
    const asTitle = TitleId.of('SHARED-VALUE')
    const asMember = MemberId.of('SHARED-VALUE')

    expect(asTitle.value).toBe(asMember.value)
    expect(asTitle.equals(asMember)).toBe(false)

    // The compile-time half of this guarantee cannot be asserted at runtime:
    //     const wrong: TitleId = asMember
    // does not typecheck, because each subclass declares a distinct `_tag`.
  })
})
