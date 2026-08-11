# Two models of the word "stock"

> The same real-world object is an Entity on one side of the building and an
> anonymous unit on the other. Both models are correct.

`pnpm scenario:6` runs this side by side.

---

## The same word, two models

The library and its shop annex both hold copies of *Dune* on shelves, twenty
metres apart. Both call it "stock". The models share nothing.

```ts
// packages/library/inventory/src/domain/book-stock.ts
export class BookStock extends AggregateRoot<TitleId> {
  readonly #copies = new Map<string, Copy>()      // identified entities
  #availableCount = 0
}

// packages/bookshop/inventory/src/domain/stock-item.ts
export class StockItem extends AggregateRoot<ProductId> {
  #onHand: number                                  // …a number
  #reserved: number
}
```

| | **Library `BookStock`** | **Shop `StockItem`** |
|---|---|---|
| Stock is | a set of identified `Copy` entities | two integers |
| Child entities | one per physical volume | **none** |
| *"Which one?"* | a question with an answer | a meaningless question |
| Lifecycle | lent, damaged, repaired, lost, withdrawn | none — units interchangeable |
| Aggregate id | `TitleId` | `ProductId` |
| Invariant | count matches the shelf | reserved ≤ on hand |

---

## Why the library cannot use the shop's model

Because *"the copy you have at home"* is a phrase the business depends on:

- an overdue notice names a volume;
- a damage charge is levied on a volume;
- the hold shelf physically holds a volume;
- a volume with a broken spine goes to the binder, and the library must know
  which one came back.

Reduce that to a counter and the domain becomes inexpressible. Not harder to
express — **impossible**. There is no query over `quantityOnHand` that answers
"which copy is at Alice's house".

## Why the shop must not use the library's model

Because nobody ever asks. A customer buying *Dune* does not care which of the
four boxed copies they receive, and the shop has no reason to track it.

Inventing a `ShopCopy` entity would produce:

- identity that means nothing (a generated id nobody refers to);
- a lifecycle nobody observes (`Sold` — then what?);
- a table that grows with sales volume, forever, for no benefit;
- and a reporting layer that has to `COUNT(*)` what could have been a column.

**Ceremony is not rigour.** Modelling something as an entity when the business
has no notion of its identity is a cost with no matching benefit.

---

## The general principle

> **Identity is not a property of the *thing*. It is a property of what your
> business needs to say about the thing.**

The book on the shelf does not change when you carry it from the lending room to
the shop. What changes is which questions someone will ask about it. Model the
questions.

This generalises well beyond books:

| Thing | Entity where… | Value/quantity where… |
|---|---|---|
| A banknote | the central bank tracks serial numbers | you are paying for coffee |
| A seat | on an aircraft (12A) | in a cinema selling "3 tickets" |
| A parcel | in a courier's tracking system | in a warehouse counting pallets |
| An email | in a mailbox (thread, read state) | in a monthly send quota |

The same object, both columns, depending on who is asking.

---

## This is what a bounded context is *for*

A single shared `Stock` model would have to serve both. It would carry identity
the shop does not want, or lose identity the library cannot do without. In
practice you get the worst outcome: identity present but half-maintained,
because half the system does not care about it.

Two contexts, two models, no shared code. The only thing they agree on:

```ts
library title  → 978-0-44-101359-3
shop product   → 978-0-44-101359-3
```

**The ISBN is the entire integration surface.** Both contexts agree on which
*work* they are talking about, and on nothing else.

Note that they do not even share an aggregate id. The shop has its own
`ProductId`, because "this edition, this cover price, this supplier" is the
shop's notion of a stock line, and giving it `TitleId` would quietly assert that
the two contexts mean the same thing by it. They do not.

---

## Invariants without a cluster

`StockItem` has a genuine invariant — *reserved never exceeds on hand* — and
protects it with two fields of a single object:

```ts
override assertInvariants(): void {
  if (this.#onHand < 0)                  throw new InvariantViolation(/* … */)
  if (this.#reserved < 0)                throw new InvariantViolation(/* … */)
  if (this.#reserved > this.#onHand)     throw new InvariantViolation(
    'the shop never promises more copies than it holds', /* … */)
}
```

It never overrides `childEntities()`, because there are no children to declare.

**Having an invariant does not imply having a cluster.** Reach for child
entities when the rule spans objects that each have their own identity — not
because an aggregate looks too simple without them.

---

## Where to look in the code

| | |
|---|---|
| Copy-based stock | `packages/library/inventory/src/domain/book-stock.ts` |
| Quantity-based stock | `packages/bookshop/inventory/src/domain/stock-item.ts` |
| The shared vocabulary | `packages/shared-kernel/src/` |
| Scenario | `pnpm scenario:6` |
| Tests | `tests/book-stock.test.ts` vs `tests/bookshop-stock.test.ts` |

Reading the two test files back to back is the fastest way to feel the
difference: one is full of barcodes and lifecycles, the other is arithmetic.

---

## Further reading

- **[Bounded Context](https://martinfowler.com/bliki/BoundedContext.html)**
  — Martin Fowler. Why one unified model across an organisation fails, and what
  it means for one word to name two different things.
- **[Ubiquitous Language](https://martinfowler.com/bliki/UbiquitousLanguage.html)**
  — Martin Fowler. The shared language of developers and domain experts,
  structured by the model rather than agreed in a glossary.
- **[Anemic Domain Model](https://martinfowler.com/bliki/AnemicDomainModel.html)**
  — Martin Fowler, 2003. Worth reading before deciding whether the shop's
  `StockItem` is anaemic or simply small.

---

**Previous:** [← Domain events](05-domain-events.md) · **Next:** [Architecture →](07-architecture.md)
