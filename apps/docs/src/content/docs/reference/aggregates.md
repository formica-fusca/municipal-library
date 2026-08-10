---
title: The aggregates at a glance
description: Every aggregate root in the system, the children it holds, and the invariant it exists to protect.
sidebar:
  order: 1
---

Six aggregate roots across five bounded contexts. Two of them hold child
entities, and both were given children for the same reason: a rule that must
hold across several objects *at every instant*.

| Aggregate root | Context | Children | The invariant it exists to protect |
|---|---|---|---|
| `Title` | Catalogue | — | heading, author, and a plausible publication year |
| `BookStock` | Inventory | `Copy` | **`availableCount` always equals the copies on the shelf** |
| `Member` | Membership | — | a member never has a negative number of loans |
| `Loan` | Lending | — | falls due after it was opened; not returned before borrowed |
| `HoldQueue` | Lending | `HoldRequest` | one place per member · collect-by exactly for allocations · **ordered by request time** |
| `StockItem` | Shop | — | reserved never exceeds on hand |

## What is deliberately absent

Two rules look like invariants and are not modelled as such. Both omissions are
load-bearing.

**"A member may hold at most *n* loans."** This spans `Member` and every one of
their `Loan`s, so no single aggregate can guarantee it. Enforcing it atomically
would mean putting every loan inside `Member` — and then every borrow in the
library takes a lock on that member's entire history. It is modelled instead as
a policy checked at decision time, with the counter repaired afterwards by a
handler on `lending.loan-opened`. See [Invariants](/concepts/04-invariants/).

**"A walk-in must not take a copy set aside for someone ahead of them."** This
spans `HoldQueue` and `BookStock`, in different contexts. It lives in the
`BorrowBook` use case, and it is *checked*, not guaranteed — an allocation could
land between the read and the write. The race is named in the code rather than
hidden, because the alternative is locking the queue on every borrow in the
building.

## Child entities

| Child | Inside | Why it is not a root |
|---|---|---|
| `Copy` | `BookStock` | its status change must move the root's counter in the same breath |
| `HoldRequest` | `HoldQueue` | "third in the queue" is a property of its position among the others |

Neither is exported from its package. TypeScript has no package-private
modifier, so the export list *is* the access modifier: no code outside the
package can name the type, so none can hold one.

Snapshots go out instead — `CopySnapshot`, `HoldRequestSnapshot` — inert data
that nobody can mutate anything with.

## Domain events, by who records them

The rule: **a child records a fact only it holds the knowledge for; the root
records facts about the cluster.**

| Event | Recorded by | Because |
|---|---|---|
| `inventory.copy-damaged` | `Copy` (child) | only this volume knows its own condition |
| `inventory.copy-lost` | `Copy` (child) | likewise |
| `inventory.copy-repaired` | `Copy` (child) | likewise |
| `inventory.copy-withdrawn` | `Copy` (child) | likewise |
| `inventory.copy-acquired` | `BookStock` (root) | stock growing is a fact about the cluster |
| `inventory.copy-checked-out` | `BookStock` (root) | the root *chose* the copy, so it authored the fact |
| `inventory.copy-returned` | `BookStock` (root) | likewise |
| `inventory.title-became-available` | `BookStock` (root) | needs every copy in view |
| `inventory.title-out-of-stock` | `BookStock` (root) | likewise |
| `lending.hold-expired` | `HoldRequest` (child) | it knows its own collect-by date passed |
| `lending.hold-cancelled` | `HoldRequest` (child) | the member's decision about their own request |
| `lending.hold-fulfilled` | `HoldRequest` (child) | likewise |
| `lending.hold-placed` | `HoldQueue` (root) | the position is a fact about the queue |
| `lending.hold-allocated` | `HoldQueue` (root) | "chosen ahead of the others" needs the others |

`hold-allocated` beside `hold-expired` is the cleanest illustration of the rule.
Expiry is one member's own deadline lapsing. Allocation is inherently
comparative — no single request can know it was chosen.

Publication is always the root's, in both cases. See [Domain
events](/concepts/05-domain-events/).
