import type { DomainEvent } from './domain-event.js'
import type { Identifier } from './identifier.js'

/**
 * An Entity is a domain object defined by **who it is**, not by **what it
 * holds**.
 *
 * Its attributes change over their lifetime — a copy of a book gets rebound,
 * relabelled, moved to another shelf — and it remains the same copy throughout.
 * That thread of continuity *is* the entity. Equality therefore compares
 * identity and nothing else.
 *
 * ## Entities record events; they do not publish them
 *
 * Every Entity can `record()` a domain event into a private buffer. Nothing
 * else. There is no bus here, no publish method, no way out.
 *
 * The only exit is {@link AggregateRoot.pullDomainEvents}, which drains this
 * buffer along with those of every child entity the root declares. A child
 * entity that records an event and is *not* reachable from its root's
 * `childEntities()` will simply never have that event dispatched — silently.
 *
 * That is the design answer to "can an entity emit a domain event?": it can
 * *describe* what happened to it, because it is the only object that knows;
 * but the aggregate root decides what leaves the boundary, because it is the
 * only object that knows whether the change was consistent.
 *
 * See `docs/05-domain-events.md`.
 */
export abstract class Entity<TId extends Identifier> {
  readonly #recordedEvents: DomainEvent[] = []

  readonly id: TId

  protected constructor(id: TId) {
    this.id = id
  }

  /**
   * Identity equality. Note what is *not* compared: none of the attributes.
   * Two `Copy` instances loaded separately from the repository, one of them
   * stale, are still the same copy.
   */
  equals(other: Entity<Identifier> | null | undefined): boolean {
    if (other === null || other === undefined) return false
    if (other === this) return true
    if (other.constructor !== this.constructor) return false
    return this.id.equals(other.id)
  }

  /**
   * Append an event to this entity's private buffer.
   *
   * `protected` on purpose: only the entity's own behaviour may record what
   * happened to it. Application services cannot fabricate history from outside.
   */
  protected record(event: DomainEvent): void {
    this.#recordedEvents.push(event)
  }

  /**
   * Drain the buffer. Called by the aggregate root — see the class comment.
   *
   * Draining rather than copying is deliberate: an event must be dispatched
   * exactly once. If a root is saved twice, the second save must not replay
   * history.
   */
  pullDomainEvents(): readonly DomainEvent[] {
    const drained = [...this.#recordedEvents]
    this.#recordedEvents.length = 0
    return drained
  }

  get hasPendingEvents(): boolean {
    return this.#recordedEvents.length > 0
  }
}
