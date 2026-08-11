import type { AggregateRoot } from "../aggregate-root.js";
import type { Identifier } from "../identifier.js";
import type { Repository } from "../lib/repository.js";

/**
 * A Map-backed repository, shared by every bounded context in this showcase.
 *
 * ## Why it lives behind a `/testing` subpath
 *
 * This is infrastructure, and `@local/ddd-core` is a domain-primitives
 * package. Exporting it from the package root would put a storage
 * implementation one auto-import away from every domain file in the repo — the
 * exact leak the layering is supposed to prevent. Putting it behind
 * `@local/ddd-core/testing` keeps the import visible and deliberate: you can
 * see, at the import line, that a file has reached for a fake.
 *
 * ## What it deliberately does *not* do
 *
 * It does not dispatch domain events. Saving is one concern; publishing is
 * another, and conflating them is how you end up with events escaping before
 * the write that justified them has succeeded. See `UnitOfWork` in
 * `@local/event-bus`.
 */
export class InMemoryRepository<
  TAggregate extends AggregateRoot<TId>,
  TId extends Identifier,
> implements Repository<TAggregate, TId> {
  protected readonly store = new Map<string, TAggregate>();

  async findById(id: TId): Promise<TAggregate | undefined> {
    return this.store.get(id.value);
  }

  async save(aggregate: TAggregate): Promise<void> {
    // A real repository would write here and fail loudly on a conflict.
    // Asserting invariants at the boundary is the closest honest equivalent:
    // nothing inconsistent is allowed to reach storage.
    aggregate.assertInvariants();
    this.store.set(aggregate.id.value, aggregate);
  }

  async all(): Promise<readonly TAggregate[]> {
    return [...this.store.values()];
  }

  get size(): number {
    return this.store.size;
  }
}
