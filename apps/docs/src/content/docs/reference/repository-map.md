---
title: A map of the repository
description: Where everything lives, the conventions worth knowing before reading the code, and how to run it.
sidebar:
  order: 3
---

## Layout

The top level names the thing, not the layer: two businesses, the generic
machinery they both sit on, and the one place they meet.

```
foundation/
  ddd-core/            Entity · AggregateRoot · ValueObject · DomainEvent · Identifier
  shared-kernel/       Isbn · Money · TitleId · CopyId · MemberId
  event-bus/           the hand-rolled pub/sub + UnitOfWork (dispatch after commit)
library/
  catalog/             Title
  inventory/           BookStock ─ Copy          ← the showcase aggregate
  membership/          Member
  lending/             Loan · HoldQueue ─ HoldRequest
bookshop/
  inventory/           StockItem                 ← the contrast
composition/           wiring.ts — the one place the contexts meet
apps/
  scenarios/           six narrated scripts — a terminal over the composition
  docs/                this site, including the live playground
tests/                 70 tests against the published surface of each context
docs/                  the concept documents, in prose
```

`library/inventory` and `bookshop/inventory` share a name deliberately — one
word, two businesses, two models that cannot be reconciled. See
[two models of stock](/concepts/06-two-models-of-stock/).

Everything under `foundation/` is domain-agnostic, with one exception worth
knowing: `shared-kernel` holds domain vocabulary that both businesses own
jointly, which makes changing it an agreement rather than an upgrade.

`composition` is a package, not part of an app, because there are two
ways to drive this model and only one way it is wired. It compiles with
`"types": []` — `console` and `process` are build errors inside it — which is
precisely what lets [the playground](/playground/) run the real aggregates in a
browser instead of a reimplementation.

Inside every context: `domain/` (the model and the interfaces it needs stated in
its own words), `application/` (use cases, one aggregate each), `infrastructure/`
(implementations). Only `index.ts` is importable from outside.

## Commands

| | |
|---|---|
| `pnpm build` | `tsc -b` across the project graph |
| `pnpm test` | builds, then runs 70 tests |
| `pnpm scenarios` | all six walkthroughs, in order |
| `pnpm scenario:1` … `:6` | one at a time |
| `pnpm docs:dev` | this site, including [the playground](/playground/) (restart it to pick up edits to `docs/*.md`) |
| `pnpm docs:build` | static build into `apps/docs/dist/` |
| `pnpm docs:check` | `astro check` over the site's own TypeScript |

## Conventions worth knowing before you read the code

**`#private` fields, not `private`.** Encapsulation enforced by the runtime
rather than only by the compiler — a subclass cannot reach into an aggregate's
event buffer.

**Named constructors.** `Title.register(...)` records that it happened;
`Title.rehydrate(...)` reconstructs from storage and deliberately records
nothing. You cannot reload an aggregate and accidentally re-announce a
decade-old event.

**No aggregate calls `new Date()` or `randomUUID()`.** Time arrives as a
`Clock`, ids as an `IdentifierFactory`. Time is a business input in this domain —
loans fall due, holds expire, suspensions lapse — and a model that reaches for
the clock internally cannot be reasoned about, only experimented on. The
scenarios drive a `FixedClock` by hand and mint sequential ids, so transcripts
are byte-identical between runs.

**Aggregates reference each other by id, never by object.** A `Loan` holds a
`MemberId`, never a `Member`. If it held the object, *"just check the member's
standing while we're here"* would be one dot away.

**Snapshots out, never entities.** Public methods return inert data.

**`DomainError` ≠ `InvariantViolation`.** The first is the business saying no —
print it at the counter. The second means the model has a bug and somebody
should be paged. Give them the same type and one day they will be handled the
same way.

## One deliberate hole

`BookStock.unsafeCopyForTeaching()` hands a live child entity to a caller
outside the aggregate — precisely what an aggregate exists to prevent. It exists
so [scenario 4](/scenarios/04-invariants-under-attack/) and
[the playground](/playground/) can break the invariant for real rather than
describing it in prose. Delete it and the only thing that stops working is the
lesson.

## What this repository is not

- **No persistence.** `InMemoryRepository` is a `Map`. Real repositories bring
  optimistic concurrency, which is where aggregate boundaries stop being a design
  opinion and start being a lock.
- **No transactional outbox.** `UnitOfWork` publishes in-process after saving.
  The remaining crash window is described in [Domain
  events](/concepts/05-domain-events/).
- **No true concurrency.** The bus dispatches sequentially so transcripts stay
  deterministic. Races are *named* in the code rather than exercised.
