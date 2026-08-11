# Entity vs Aggregate Root

> Every Aggregate Root is an Entity. Not every Entity is an Aggregate Root.

This is the distinction people find hardest, largely because most tutorials only
ever show aggregates that happen to be single entities — so the two ideas never
get pulled apart. This repository has two aggregates with children specifically
so they can be.

---

## The relationship

```
        Entity                       ← has identity, has behaviour, has its own rules
           ▲
           │ extends
           │
     AggregateRoot                   ← Entity + consistency boundary
                                       + unit of persistence
                                       + unit of publication
```

In code, literally:

```ts
// packages/ddd-core/src/aggregate-root.ts
export abstract class AggregateRoot<TId extends Identifier> extends Entity<TId> {
  protected childEntities(): readonly Entity<Identifier>[] { return [] }
  override pullDomainEvents(): readonly DomainEvent[] { /* own + children */ }
  abstract assertInvariants(): void
}
```

Three additions. That is the entire difference in this codebase, and each one
corresponds to one of the three extra responsibilities.

---

## The difference, in one table

| | **Entity** (child) | **Aggregate Root** |
|---|---|---|
| Has identity | yes | yes |
| Has behaviour | yes | yes |
| Enforces rules | its own, *local* ones | rules **spanning the cluster** |
| Reachable from outside | **no** | yes — it is the only entry point |
| Has a repository | **never** | exactly one |
| Loaded independently | no | yes |
| Referenced by other aggregates | no | yes, by id |
| Publishes domain events | records only | records **and releases** |
| Example | `Copy`, `HoldRequest` | `BookStock`, `HoldQueue`, `Loan`, `Member` |

---

## Worked comparison: `Copy` and `BookStock`

Both are entities. Both have identity, behaviour and rules.

**`Copy` enforces a rule it can check alone.** Is this status transition legal?
Answering needs nothing but the copy's own current status. No sibling is
consulted.

**`BookStock` enforces a rule no single copy could check.** Does the count match
the shelf? Answering requires seeing *every* copy at once.

That is the dividing line, and it is worth stating as a test you can apply:

> **If answering the question requires seeing the siblings, the rule belongs to
> the root. If it does not, it belongs to the entity.**

Both objects are entities. Only one is a boundary.

---

## Why `Copy` must not be an Aggregate Root

Suppose it were, with its own `CopyRepository`. Two librarians serve two members
at once:

```
  Librarian A                          Librarian B
  ───────────                          ───────────
  load Copy #101 (Available)
                                       load Copy #102 (Available)
  copy.lendOut()                       copy.lendOut()
  save                                 save
```

Both writes succeed. Each copy is individually correct. But nothing anywhere
decremented a count of what is on the shelf — and if a `BookStock` row exists
holding that count, it is now wrong, with no operation having been illegal.

Making `Copy` a child of `BookStock` means both librarians must load the same
root, and whatever concurrency control you use — optimistic version, row lock —
now has one place to act. **The aggregate is the unit of consistency because it
is the unit of locking.**

---

## Why `Loan` must *not* be a child of `Member`

The mirror-image mistake, and much more tempting, because it appears to buy you
a real invariant: put every `Loan` inside `Member` and "at most 8 loans" becomes
enforceable atomically.

It is still the wrong call:

- **Contention.** Every borrow, return and renewal in the library would load and
  lock the member's entire loan history.
- **Unbounded growth.** Loans accumulate for decades; members persist. An
  ever-growing collection is an aggregate you will have to split later, under
  pressure, with data already in it.
- **Lifetimes differ.** Loans are closed and archived. Members are not.

So `Loan` is its own root, and the rule moves — it becomes a policy checked at
decision time, with the counter reconciled by an event handler.
[Document 4](04-invariants.md) works through the consequences.

Notice the shape of both decisions: **the invariant did not disappear, it
changed category.** That is almost always what "the aggregate is too big" means
in practice.

---

## Decision procedure

When you are unsure whether X belongs inside Y or beside it:

1. **Write down the rule** connecting them, as a sentence a domain expert would
   recognise. If you cannot, they are not one aggregate — you were pattern-
   matching on "feels related".
2. **Ask: must it hold at every instant?** If a few seconds of disagreement is
   survivable, they are separate aggregates and the rule becomes a policy plus
   an event.
3. **Ask: can X be loaded and changed on its own, meaningfully?** "Third in the
   queue" is not a property of a `HoldRequest` — it is a property of its
   position among the others. That is a strong tell that it belongs inside.
4. **Ask: does anything outside need to reference X by id?** If another
   aggregate needs to point at it, it probably needs to be a root.
5. **Check the growth.** Will the collection grow without bound?

`Copy` fails 3 (its meaning is positional in the stock) and 4 — note that `Loan`
holds a `CopyId`, but only ever to *name* the volume, never to load and change it
independently of its stock.

---

## The signature you cannot see: reachability

The most important difference is not on any class. It is that **nothing outside
`@local/library-inventory` can name the type `Copy`**, because it is not in the
package's `index.ts`:

```ts
// packages/library/inventory/src/index.ts
export { BookStock } from './domain/book-stock.js'
export type { CopySnapshot } from './domain/copy.js'   // ← inert data
// `Copy` itself: deliberately absent
```

TypeScript has no package-private modifier, so **the export list is the access
modifier**. Every method on `Copy` is `public`, because `BookStock` must call
them — but publicness only matters to code that can obtain a reference, and no
code outside can.

Snapshots go out instead: plain, inert data that no one can mutate anything
with.

---

## Where to look in the code

| | |
|---|---|
| Child entity, root in the same folder | `packages/library/inventory/src/domain/` |
| A second pair | `packages/library/lending/src/domain/hold-request.ts` + `hold-queue.ts` |
| The boundary as an export list | `packages/library/inventory/src/index.ts` |
| The boundary broken on purpose | `scenarios/04-invariants-under-attack.ts` |
| Tests | `tests/book-stock.test.ts` |

---

## Further reading

- **[Effective Aggregate Design, part 2](https://www.dddcommunity.org/wp-content/uploads/files/pdf_articles/Vernon_2011_2.pdf)**
  — Vaughn Vernon, 2011. Referencing another aggregate by identity rather than
  by object reference, and what that costs at the point of use.
- **[Tell Don't Ask](https://martinfowler.com/bliki/TellDontAsk.html)**
  — Martin Fowler. Not a DDD article, but the principle behind a root exposing
  behaviour instead of handing out its internals.
- **[Domain-Driven Design Reference](https://www.domainlanguage.com/ddd/reference/)**
  — Eric Evans, 2015. The Aggregates section, for the original wording of what a
  root is responsible for.

---

**Previous:** [← Aggregate Root](02-aggregate-root.md) · **Next:** [Invariants →](04-invariants.md)
