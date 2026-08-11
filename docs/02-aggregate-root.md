# Aggregate Root

> An Entity with a second job: it is the **consistency boundary** for a cluster
> of objects that must obey a rule together.

---

## The one criterion

People agonise over aggregate design far longer than they need to, usually
because they are asking *"do these things belong together?"* — a question with
no answer, since almost everything in a domain is related to almost everything
else.

The question that does have an answer:

> **Is there a rule that must be true across these objects at every instant?**

If yes, they are one aggregate, and the object that owns the rule is the root.
If the rule may be true *shortly afterwards* — eventually — they are separate
aggregates, and an event connects them.

That is the whole criterion. Everything below follows from it.

---

## Worked example: `BookStock`

The library's rule:

> **`availableCount` always equals the number of copies whose status is
> `Available`.**

That sentence spans the root and every copy simultaneously. It is not allowed to
be true "in a moment": a librarian reading the count and a librarian looking at
the shelf must never disagree. So `Copy` lives inside `BookStock`.

```ts
export class BookStock extends AggregateRoot<TitleId> {
  readonly #copies = new Map<string, Copy>()
  #availableCount = 0
```

Two design choices here are worth arguing about.

**The counter is cached, not recomputed.** A value recalculated on every read
cannot possibly disagree with the copies — which would make it an invariant that
cannot break, and therefore an invariant that teaches you nothing. This one is
maintained incrementally, it genuinely can drift, and
`scenarios/04-invariants-under-attack.ts` drifts it on purpose.

**Nothing outside may hold a `Copy`.** TypeScript has no package-private
modifier, so the boundary is held by the export list: `Copy` is simply absent
from `packages/library/inventory/src/index.ts`. No other package can name the
type, so no other package can hold one.

---

## The three responsibilities

### 1. It is the only way in

Every mutation is a method on the root, so the counter moves in the same breath
as the status:

```ts
reportDamaged(copyId: CopyId, reason: string, at: Date): void {
  const copy = this.#copyOrFail(copyId)
  const wasOnShelf = copy.isOnShelf

  copy.reportDamaged(reason, at)          // the child validates its own transition

  if (wasOnShelf) this.#shiftAvailability(-1, at)
  this.assertInvariants()
}
```

Hand a caller the `Copy` instead, and they can call `reportDamaged` directly.
Nothing throws. The status changes and the counter does not, and the aggregate
is quietly wrong until something else notices. Scenario 4 does exactly this via
a method named `unsafeCopyForTeaching`, which exists for no other purpose.

### 2. It guarantees its invariants

```ts
abstract assertInvariants(): void
```

Abstract on purpose. Declaring an aggregate root is a claim that you are
protecting something, and this method is where you say what. If your
implementation is genuinely empty, that is a signal the cluster may not need to
be an aggregate at all.

It is called at the end of every mutating method, and again by the repository
before storing — so nothing inconsistent reaches storage even when a caller
misbehaves.

### 3. It is the unit of persistence and of publication

**One repository per aggregate root, never per entity.** There is no
`CopyRepository` in this codebase, and adding one would destroy the boundary: it
would let a caller load one copy, change it, and save it with `BookStock` never
getting the chance to adjust its counter.

Domain events leave through the root as well — see
[document 5](05-domain-events.md).

---

## How big should an aggregate be?

**As small as its invariants allow.** Large aggregates are the most common and
most expensive DDD mistake, because the costs arrive late:

- **Contention.** The aggregate is the unit of locking. Put every `Loan` inside
  `Member` and two librarians serving the same regular reader serialise behind
  each other.
- **Load cost.** You must load the whole thing to change any of it.
- **Unbounded growth.** A collection that only ever grows is an aggregate you
  will eventually have to split under duress.

The tempting design in this domain is `Member` owning a list of `Loan`s, so that
"at most 8 loans" becomes a real invariant. This repository deliberately does
not do that, and [document 4](04-invariants.md) is largely about why.

---

## Referencing other aggregates

**By identity, never by object.**

```ts
export class Loan extends AggregateRoot<LoanId> {
  readonly #memberId: MemberId      // not Member
  readonly #titleId: TitleId        // not Title
  readonly #copyId: CopyId          // not Copy
```

If a `Loan` held a live `Member`, then "just check the member's standing while
we're here" would be one dot away, and the two aggregates would be welded
together within a sprint. Holding only an id makes the boundary something you
have to *cross deliberately* — through a repository, a port, or an event.

The same discipline applies to events: they carry ids and primitive values, never
aggregate instances. An event may be handled long after it was raised, possibly
in another process; shipping a live object inside it would smuggle a mutable,
already-stale reference across the boundary.

---

## One aggregate changed per transaction

A use case should modify exactly one aggregate. `BorrowBook` touches three and
modifies one:

| Aggregate | How |
|---|---|
| `Member` | **read** through a port, to check eligibility |
| `BookStock` | changed in **Inventory's own** transaction, behind a port |
| `Loan` | **created and committed here** |

The member's loan counter is updated afterwards, by a handler reacting to
`LoanOpened`. That leaves a genuine window in which the loan exists and the
counter has not caught up — which is the price of not locking three aggregates
together, and the model states the price out loud rather than pretending it is
not being paid.

---

## Not every aggregate root has children

`Title`, `Member`, `Loan` and `StockItem` have none. `StockItem` has a real
invariant — *reserved never exceeds on hand* — and protects it with two fields
of one object.

Having an invariant does not imply having a cluster, and being an Aggregate Root
is not a status symbol. It means "this is the thing a repository loads and
saves". Reference data needs that just as much as a rich behavioural cluster.

---

## Where to look in the code

| | |
|---|---|
| Base class | `packages/ddd-core/src/aggregate-root.ts` |
| The showcase | `packages/library/inventory/src/domain/book-stock.ts` |
| A second one with children | `packages/library/lending/src/domain/hold-queue.ts` |
| One with none | `packages/bookshop/inventory/src/domain/stock-item.ts` |
| Repository rule | `packages/ddd-core/src/repository.ts` |
| Tests | `tests/book-stock.test.ts`, `tests/hold-queue.test.ts` |

---

## Further reading

- **[DDD_Aggregate](https://martinfowler.com/bliki/DDD_Aggregate.html)**
  — Martin Fowler. An aggregate as one unit for data changes, with the root as
  the only member anything outside may hold a reference to.
- **[Effective Aggregate Design, part 1](https://www.dddcommunity.org/wp-content/uploads/files/pdf_articles/Vernon_2011_1.pdf)**
  — Vaughn Vernon, 2011. The argument that a consistency boundary should contain
  exactly what a true invariant spans, worked through on a real model.
- **[Repository](https://martinfowler.com/eaaCatalog/repository.html)**
  — Martin Fowler, *PoEAA*, 2002. The pattern itself; the one-per-aggregate-root
  rule applied here comes from Evans rather than from this entry.

---

**Previous:** [← Entity](01-entity.md) · **Next:** [Entity vs Aggregate Root →](03-entity-vs-aggregate.md)
