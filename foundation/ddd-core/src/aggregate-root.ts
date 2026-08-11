import type { DomainEvent } from './domain-event.js'
import { Entity } from './entity.js'
import type { Identifier } from './identifier.js'

/**
 * An Aggregate Root is an Entity with a second job: it is the **consistency
 * boundary** for a cluster of objects that must obey a rule together.
 *
 * Every Aggregate Root is an Entity. Not every Entity is an Aggregate Root.
 * The extra responsibilities are exactly three:
 *
 * 1. **It is the only way in.** Nothing outside the aggregate may hold a
 *    reference to a child entity, and nothing outside may call a method on one.
 *    All behaviour is invoked on the root.
 * 2. **It guarantees its invariants.** After any method returns, the rule
 *    spanning the cluster holds. This is only possible because rule (1)
 *    prevents anyone changing a child behind the root's back.
 * 3. **It is the unit of persistence and of publication.** Repositories load
 *    and save whole aggregates; domain events leave the model through the root.
 *
 * ## How big should an aggregate be?
 *
 * As small as its invariants allow. Two objects belong in the same aggregate
 * **only** if there is a rule that must be true of both of them *at every
 * instant*. If the rule can be true "shortly afterwards" — eventually — then
 * they are two aggregates and an event connects them.
 *
 * In this codebase: `BookStock` contains its `Copy` entities because
 * `availableCount` must match the copies at every instant. `Member` and `Loan`
 * are separate aggregates, because "a member has at most N loans" is allowed to
 * be repaired a moment later, by an event handler.
 *
 * See `docs/02-aggregate-root.md` and `docs/03-entity-vs-aggregate.md`.
 */
export abstract class AggregateRoot<TId extends Identifier> extends Entity<TId> {
  /**
   * The child entities living inside this boundary.
   *
   * The root must declare them, because it is the root's job to drain their
   * recorded events. Forget one and its events are silently dropped — a real
   * failure mode, demonstrated in `scenarios/05-can-an-entity-emit-an-event.ts`.
   *
   * Defaults to none: plenty of aggregate roots are a single entity with no
   * children at all, and that is not a design failure.
   */
  protected childEntities(): readonly Entity<Identifier>[] {
    return []
  }

  /**
   * Drains this root's events *and* those of its children, restoring causal
   * order via the sequence stamp.
   *
   * Without the sort, every child event would appear after every root event,
   * which would misreport what happened: a `CopyDamaged` recorded by a `Copy`
   * before the root recorded `TitleOutOfStock` must stay before it.
   */
  override pullDomainEvents(): readonly DomainEvent[] {
    const ownEvents = super.pullDomainEvents()
    const childEvents = this.childEntities().flatMap((child) => child.pullDomainEvents())

    return [...ownEvents, ...childEvents].sort((a, b) => a.sequence - b.sequence)
  }

  /**
   * Assert every rule this aggregate is responsible for.
   *
   * Abstract on purpose: declaring an aggregate root is a claim that you are
   * protecting *something*, and this method is where you say what. An
   * implementation that is genuinely empty is a signal that the cluster may not
   * need to be an aggregate at all.
   *
   * Call it at the end of every mutating method. In a persistent system you
   * would also call it before writing.
   */
  abstract assertInvariants(): void
}
