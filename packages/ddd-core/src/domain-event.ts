/**
 * A monotonic counter stamped onto every event at construction time.
 *
 * Why not rely on `occurredAt`? Because several events can be recorded inside
 * the same millisecond, and a domain event log that cannot preserve causal
 * order is close to useless: "copy returned" arriving before "copy lent" is
 * nonsense. A real system would use a per-aggregate version number persisted
 * alongside the state; an in-process counter is the honest toy equivalent.
 */
let sequenceCounter = 0

/**
 * Something that *has already happened* in the domain, expressed in the
 * ubiquitous language.
 *
 * Three rules follow from that one sentence:
 *
 * 1. **Past tense, always.** `CopyCheckedOut`, never `CheckOutCopy`. A command
 *    can be refused; an event cannot — it is a historical fact.
 * 2. **Immutable.** You cannot change the past.
 * 3. **Carries ids and values, never aggregate instances.** An event may be
 *    handled long after it was raised, possibly in another process. Shipping a
 *    live `BookStock` object inside it would smuggle a mutable, already-stale
 *    reference across a consistency boundary.
 */
export abstract class DomainEvent {
  /** Stable name used for subscription. Namespaced by bounded context. */
  abstract readonly name: string

  readonly occurredAt: Date

  /** Global ordering stamp — see the note on `sequenceCounter` above. */
  readonly sequence: number

  protected constructor(occurredAt: Date = new Date()) {
    this.occurredAt = occurredAt
    this.sequence = ++sequenceCounter
  }

  /**
   * The event's data, as plain serialisable values. Used for logging in the
   * scenarios and for the assertions in the tests.
   */
  abstract payload(): Record<string, string | number | boolean | null>

  describe(): string {
    const fields = Object.entries(this.payload())
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(' ')
    return `${this.name} { ${fields} }`
  }
}

/** Convenience alias for handler signatures. */
export type DomainEventName = DomainEvent['name']
