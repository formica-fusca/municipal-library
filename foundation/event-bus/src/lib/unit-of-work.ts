import type { AggregateRoot, DomainEvent, Identifier, Repository } from '@local/ddd-core'
import type { EventPublisher } from './ports.js'

/**
 * Saves an aggregate, then publishes what it recorded — in that order.
 *
 * ## Why the order is the entire point
 *
 * A domain event asserts that something *has happened*. If it is published
 * before the write succeeds, the assertion may turn out to be false: handlers
 * will have reserved a copy, emailed a member and decremented a counter on the
 * strength of a change that then failed to persist. There is no undo for an
 * email.
 *
 * So: `assertInvariants` → `save` → `pullDomainEvents` → `publish`. If the save
 * throws, the events stay in the aggregate's buffer, undispatched, and the
 * caller sees the failure.
 *
 * ## What this toy is not
 *
 * A real system has a further gap: the write commits, then the process dies
 * before publishing. The standard fix is the **transactional outbox** — write
 * the events into the same database transaction as the state change, and let a
 * separate relay push them onto the broker. Everything above stays true; only
 * `publish` changes. That is why application code depends on `EventPublisher`
 * and not on `InMemoryEventBus`.
 */
export class UnitOfWork {
  readonly #publisher: EventPublisher

  constructor(publisher: EventPublisher) {
    this.#publisher = publisher
  }

  async commit<TAggregate extends AggregateRoot<TId>, TId extends Identifier>(
    repository: Repository<TAggregate, TId>,
    aggregate: TAggregate,
  ): Promise<readonly DomainEvent[]> {
    aggregate.assertInvariants()

    await repository.save(aggregate)

    // Pulled *after* the successful save, and drained so that a second commit
    // of the same instance cannot replay history.
    const events = aggregate.pullDomainEvents()

    await this.#publisher.publish(events)

    return events
  }

  /**
   * Commit several aggregates that changed together.
   *
   * Worth flagging as a smell rather than hiding: needing this usually means
   * either the aggregate boundaries are wrong, or the second change should have
   * been an event handler reacting to the first. It exists here because the
   * borrowing use case genuinely touches two aggregates in one request, and
   * pretending otherwise would be dishonest teaching.
   */
  async commitAll(
    units: readonly {
      repository: Repository<never, never>
      aggregate: AggregateRoot<Identifier>
    }[],
  ): Promise<readonly DomainEvent[]> {
    const published: DomainEvent[] = []

    for (const unit of units) {
      unit.aggregate.assertInvariants()
    }

    for (const unit of units) {
      const repository = unit.repository as unknown as Repository<
        AggregateRoot<Identifier>,
        Identifier
      >
      await repository.save(unit.aggregate)
    }

    for (const unit of units) {
      published.push(...unit.aggregate.pullDomainEvents())
    }

    published.sort((a, b) => a.sequence - b.sequence)
    await this.#publisher.publish(published)

    return published
  }
}
