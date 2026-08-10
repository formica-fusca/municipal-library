---
title: The ubiquitous language
description: The vocabulary the model uses, and the one word it deliberately refuses.
sidebar:
  order: 2
---

The code uses these words and no others. Where a word was rejected, the
rejection is part of the design.

| Term | Means | Explicitly **not** |
|---|---|---|
| **Title** | A work in the catalogue: *Dune*, Frank Herbert, 1965 | a physical object |
| **Copy** | One physical volume, identified by the barcode in its cover | a title |
| **Stock** | All the copies of one title | a quantity (in the library) |
| **On record** | Every `Copy` a stock has ever acquired, lost and withdrawn included | how many volumes the library has |
| **Held** | The volumes the library still physically has, wherever they are | the volumes that can be borrowed |
| **Available** | A volume on a shelf, borrowable right now | a volume the library owns |
| **Member** | A person holding a library card | a "user" |
| **Loan** | One volume, in one member's hands, until a due date | a "borrow record" |
| **Hold** | A member's place in the queue for a title | a reservation of a specific copy |
| **Allocation** | A returned copy set aside for a specific member | a loan |
| **Collection window** | The 48 hours a member has to collect an allocated copy | a due date |
| **Standing** | Whether a member is Active or Suspended | a "status" |
| **Allowance** | How many volumes a card permits at once | a limit enforced atomically |
| **Product** | A line of shop stock: this edition, this price, this supplier | a Title |
| **Sellable** | Shop stock on hand minus stock reserved | stock on hand |

## Three ways to count the same shelf

`BookStock` answers three questions about the same set of volumes, and they
diverge the moment anything goes wrong:

```
totalCopies   on record   ── every Copy, forever
heldCount     held        ── minus Lost and Withdrawn
availableCount available  ── minus OnLoan and Damaged too
```

Losing a volume drops the last two and leaves the first alone, because a
terminal status removes the volume from the library and never the record from
the aggregate. Delete the `Copy` and nothing can answer *"what happened to
`LIB-000102`?"*.

The distinction is worth keeping in the vocabulary because "copies" is exactly
the kind of word that quietly means all three. A screen reading **3 copies**
after one was lost is how somebody ends up filing a bug against a library that
has two — which is the same failure that gets **book** banned below, one level
down.

## The word that is banned

**"Book"** does not appear as a domain concept anywhere in this codebase.

A librarian uses it for two different things — *"we have that book"* (the work)
and *"this book is damaged"* (the volume in your hand). Modelling both as one
class is how you get a system where nobody can say whether `book.damaged` means
the edition is out of print or a specific volume has a torn spine.

So the vocabulary forces the distinction: a **Title** is catalogued, a **Copy**
sits on a shelf. They are different aggregates in different bounded contexts,
connected only by `TitleId`.

## Words that mean different things in different contexts

This is not sloppiness — it is what bounded contexts are *for*. A term is only
ever defined relative to the context that owns it.

| Word | In the library | In the shop |
|---|---|---|
| **Stock** | a set of identified `Copy` entities | two integers |
| **Reserve** | join a queue for a title you cannot have yet | set aside units you have already chosen |
| **Available** | a copy is on the shelf and lendable | units exist that are not already promised |

A single shared definition would have to serve both and would serve neither. See
[Two models of stock](/concepts/06-two-models-of-stock/).

## Events read as sentences

Domain events are past tense, always, and namespaced by the context that owns
them. A command can be refused; an event cannot — it is a historical fact.

```
inventory.copy-checked-out          ✓  it happened
inventory.check-out-copy            ✗  that is a command
```
