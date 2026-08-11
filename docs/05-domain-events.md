# Domain events

> **Can an entity emit a domain event, or must it come from the aggregate root?**

This is the question the repository was built to answer. `pnpm scenario:5` runs
the argument; this document sets it out in prose. The debate it answers is
collected under [Further reading](#further-reading) at the end.

---

## The question conflates two verbs

Separate them and most of the disagreement evaporates:

| | |
|---|---|
| **RECORD** | state that something happened to me |
| **PUBLISH** | put that statement on the bus, where the rest of the system acts on it |

The answer this codebase gives:

> **A child entity MAY record.** Only the aggregate root can cause anything to
> be **published** — and only after the change has been committed.

Almost every online argument about this is two people using one word for both
verbs. One means "may a `Copy` construct a `CopyDamaged`?" (obviously yes — it is
the only object that knows). The other means "may a `Copy` reach a message
broker?" (obviously no — it cannot know whether the transaction succeeded).

---

## The mechanism

`Entity` can record into a private buffer, and that is *all* it can do:

```ts
// foundation/ddd-core/src/entity.ts
export abstract class Entity<TId extends Identifier> {
  readonly #recordedEvents: DomainEvent[] = []

  protected record(event: DomainEvent): void {
    this.#recordedEvents.push(event)
  }

  pullDomainEvents(): readonly DomainEvent[] {
    const drained = [...this.#recordedEvents]
    this.#recordedEvents.length = 0        // drained, so never replayed
    return drained
  }
}
```

No bus. No publisher. No route out.

The only exit is the root, which drains its own buffer *and* its children's:

```ts
// foundation/ddd-core/src/aggregate-root.ts
override pullDomainEvents(): readonly DomainEvent[] {
  const ownEvents = super.pullDomainEvents()
  const childEvents = this.childEntities().flatMap((child) => child.pullDomainEvents())

  return [...ownEvents, ...childEvents].sort((a, b) => a.sequence - b.sequence)
}
```

And `pullDomainEvents()` is called in exactly one place in the entire system:

```ts
// foundation/event-bus/src/unit-of-work.ts
aggregate.assertInvariants()
await repository.save(aggregate)
const events = aggregate.pullDomainEvents()
await this.#publisher.publish(events)
```

So a child's event reaches the world **only** when its root was consistent and
its root's write succeeded. Not because a rule says so — because there is no
other path.

### The sort is not decoration

Without it, every root event would appear before every child event. In
`BookStock.reportDamaged`, the `Copy` records `CopyDamaged` and *then* the root
records `TitleOutOfStock`. Unsorted, the transcript would claim the shelf
emptied before the copy was damaged — an event log that cannot preserve causal
order is close to useless.

Each event stamps a monotonic `sequence` at construction, and construction
happens at the moment the thing happens. A real system would use a per-aggregate
version persisted alongside the state; an in-process counter is the honest toy
equivalent.

### The failure mode this creates

Forget to declare a child and its events go **silently** nowhere:

```ts
class ForgetfulCrate extends AggregateRoot<CrateId> {
  // childEntities() not overridden → children's events never drained
}
```

No exception. No wrong state. No failing test, unless you wrote one about
events. `tests/ddd-core.test.ts` has that test, and scenario 5 demonstrates it
live — which is why `childEntities()` is documented as *the thing that lets
events escape*, not as plumbing.

---

## Who records what — the rule

> **A child records a fact only it holds the knowledge for. The root records
> facts about the cluster.**

Applied in this codebase:

| Event | Recorded by | Because |
|---|---|---|
| `inventory.copy-damaged` | `Copy` (child) | only this volume knows its own condition |
| `inventory.copy-lost` | `Copy` (child) | likewise |
| `inventory.title-out-of-stock` | `BookStock` (root) | needs to see every copy |
| `inventory.copy-checked-out` | `BookStock` (root) | the root *chose* which copy — it authored the fact |
| `lending.hold-expired` | `HoldRequest` (child) | it knows its own collect-by date passed |
| `lending.hold-allocated` | `HoldQueue` (root) | "chosen ahead of the others" needs the others in view |

`hold-allocated` versus `hold-expired` is the cleanest illustration. Expiry is
one member's own deadline lapsing. Allocation is inherently comparative — no
single request can know it was chosen.

**A practical test when you are unsure:** could this event be raised while the
aggregate is halfway through a change and still inconsistent? If yes, it must
not leave until the root says so — which is exactly what buffering plus
commit-then-publish enforces.

---

## The linked debates, answered

### *"Handle domain events directly in aggregate?"*

Three positions circulate:

1. **Publish from inside the aggregate.** Rejected here: the aggregate would
   need a bus reference, making a pure domain object depend on infrastructure —
   and it would publish before the change is durable.
2. **Return events from methods.** Workable, but it forces every method to
   return `[result, events]` and every caller to thread them, and it breaks down
   as soon as one use case calls two methods.
3. **Buffer on the aggregate; the unit of work drains and publishes after
   commit.** What this repository does. The domain stays free of infrastructure,
   the ordering is guaranteed, and methods keep meaningful return types.

### *"Can an aggregate be part of a domain event?"*

**No.** Events carry ids and primitive values only:

```ts
constructor(params: { titleId: TitleId; copyId: CopyId; reason: string; occurredAt: Date }) {
  super(params.occurredAt)
  this.titleId = params.titleId.value      // ← flattened to a string
  this.copyId = params.copyId.value
  this.reason = params.reason
}
```

An event may be handled long after it was raised, possibly in another process.
Putting a live `BookStock` inside would smuggle a mutable, already-stale
reference across a consistency boundary — and would make the event
unserialisable the day you move to a real broker. If a handler needs the
aggregate, it loads it, fresh, by id.

### *"Can a domain event be emitted without an aggregate state change?"*

Yes, and this codebase has two:

- **`LoanBecameOverdue`.** Being overdue is *derived* — you compute it from
  `dueAt` and the clock. What is stored is `#overdueAnnounced`: not the
  condition, but whether the library has already said so. That flag exists
  because a member should be told once, not once per nightly sweep. So the state
  change is real, but it is about the *announcement*, not the fact.

- **`HoldExpired`.** Time passing is not a state change. The expiry sweep
  *makes* it one by transitioning the request to `Expired`.

The general point: if a fact is worth publishing, something usually needs to
record that it *has been* published, or you will publish it again tomorrow.
Idempotence is not a nicety in event-driven systems — anything retryable will be
retried, at the least convenient moment.

`Loan.announceOverdue()` is idempotent by construction, and scenario 2 runs the
sweep twice to show it.

---

## Publish after commit, never before

```
assertInvariants()   →   save()   →   pull()   →   publish()
```

Publish first and you may announce something that then fails to persist.
Handlers will have set aside a copy, emailed a member and decremented a counter
on the strength of a fact that never happened. There is no undo for an email.

A gap remains: the write commits and the process dies before publishing. The
standard fix is the **transactional outbox** — write the events into the same
database transaction as the state change, and let a separate relay push them
onto the broker. Everything above stays true; only `publish` changes.

That is why application code depends on the `EventPublisher` interface and never
on `InMemoryEventBus`.

---

## Naming

- **Past tense, always.** `CopyCheckedOut`, never `CheckOutCopy`. A command can
  be refused; an event cannot — it is a historical fact.
- **Namespaced by context.** `inventory.copy-damaged`, `lending.hold-allocated`.
  The prefix is the published language of that context.
- **Model the edge, not the delta.** `TitleBecameAvailable` fires when the shelf
  goes from empty to non-empty — not on every copy that arrives. Going from four
  copies to three is nobody else's business, and publishing it invites handlers
  to make decisions from a number they cannot trust to still be current.

That last one is a modelling decision, not a technical one, and scenario 1 exists
mostly to make it visible: three copies arrive, one `title-became-available`.

---

## Where to look in the code

| | |
|---|---|
| The buffer | `foundation/ddd-core/src/entity.ts` |
| The drain + sort | `foundation/ddd-core/src/aggregate-root.ts` |
| Commit ordering | `foundation/event-bus/src/unit-of-work.ts` |
| The bus | `foundation/event-bus/src/in-memory-event-bus.ts` |
| Child records, root records | `inventory/src/domain/copy.ts` + `book-stock.ts` |
| Every subscription in the system | `composition/src/wiring.ts` |
| Scenario | `pnpm scenario:5` |
| Tests | `tests/ddd-core.test.ts`, `tests/event-bus.test.ts` |

---

## Further reading

The debate this document answers, in its primary sources:

- **[Domain Event](https://martinfowler.com/eaaDev/DomainEvent.html)**
  — Martin Fowler, 2005. The original write-up: an object capturing the memory
  of something that happened, distinct from the state change it caused.
- **[Domain Events — Salvation](https://udidahan.com/2009/06/14/domain-events-salvation/)**
  — Udi Dahan, 2009. The post most of the online argument descends from. Raises
  events from inside entities and defers their dispatch.
- **[What do you mean by "Event-Driven"?](https://martinfowler.com/articles/201701-event-driven.html)**
  — Martin Fowler, 2017. Separates event notification, event-carried state
  transfer, event sourcing and CQRS — four things one phrase is used for.
- **[Domain events: design and implementation](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/domain-events-design-implementation)**
  — Microsoft. Buffering events on the aggregate, dispatching them around the
  transaction boundary, and where an integration event differs.
- **[Unit of Work](https://martinfowler.com/eaaCatalog/unitOfWork.html)**
  — Martin Fowler, *PoEAA*, 2002. The pattern that makes "publish only after
  commit" expressible at all.

---

**Previous:** [← Invariants](04-invariants.md) · **Next:** [Two models of stock →](06-two-models-of-stock.md)
