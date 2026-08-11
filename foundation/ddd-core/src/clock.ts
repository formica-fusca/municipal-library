/**
 * Time as an injected dependency.
 *
 * In this domain time is not a technical detail, it is a business input: loans
 * fall due, holds expire after 48 hours, members are suspended for a fortnight.
 * A model that calls `new Date()` internally cannot be tested and, worse,
 * cannot be *reasoned about* — "what happens on the day the hold expires?"
 * becomes an experiment rather than a question.
 *
 * Passing a `Clock` in makes the passage of time explicit in the model's own
 * vocabulary. The scenarios use `FixedClock` to fast-forward days at will.
 */
export interface Clock {
  now(): Date
}

export const systemClock: Clock = {
  now: () => new Date(),
}

/** A clock the scenarios and tests drive by hand. */
export class FixedClock implements Clock {
  #current: Date

  constructor(start: Date) {
    this.#current = new Date(start)
  }

  now(): Date {
    return new Date(this.#current)
  }

  advanceHours(hours: number): this {
    this.#current = new Date(this.#current.getTime() + hours * 60 * 60 * 1000)
    return this
  }

  advanceDays(days: number): this {
    return this.advanceHours(days * 24)
  }
}

export const daysBetween = (from: Date, to: Date): number =>
  (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)

export const addDays = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * 24 * 60 * 60 * 1000)

export const addHours = (date: Date, hours: number): Date =>
  new Date(date.getTime() + hours * 60 * 60 * 1000)
