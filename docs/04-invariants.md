# Invariants

> A statement about the model that is **true at every instant**, and that some
> object is responsible for keeping true.

Both halves matter. "True at every instant" rules out anything that is merely
usually true. "Some object is responsible" rules out wishes — if nothing
enforces it, it is documentation, not an invariant.

---

## The four places an invariant can live

Ordered by cost. Always prefer the cheapest one that can actually hold the rule.

### 1. In a type — free, and total

```ts
// foundation/shared-kernel/src/isbn.ts
export class Isbn extends ValueObject<IsbnProps> {
  private constructor(props: IsbnProps) { super(props) }

  static of(raw: string): Isbn {
    const digits = raw.replace(/[\s-]/g, '')
    if (!/^\d{13}$/.test(digits)) throw new InvariantViolation(/* … */)
    if (!Isbn.hasValidCheckDigit(digits)) throw new InvariantViolation(/* … */)
    return new Isbn({ digits })
  }
}
```

Because the constructor is private and the only way in validates, **an invalid
`Isbn` cannot exist**. Every function downstream that accepts one gets validity
for free: no defensive check, no test, no possibility of a malformed value
reaching the catalogue.

Compare with passing `isbn: string` everywhere, where validity is a property of
the *call site* and must be re-established, or re-trusted, at every hop.

This is the highest-leverage move in the whole toolkit and it is chronically
under-used.

### 2. Inside one entity — local rules

```ts
Available: ['OnLoan', 'Damaged', 'Withdrawn'],
OnLoan:    ['Available', 'Damaged', 'Lost'],
```

Checkable from the entity's own state. No siblings consulted, no repository
involved.

### 3. Across an aggregate — the reason boundaries exist

```ts
override assertInvariants(): void {
  const actuallyOnShelf = [...this.#copies.values()].filter((c) => c.isOnShelf).length

  if (this.#availableCount !== actuallyOnShelf) {
    throw new InvariantViolation(
      'the available count matches the copies on the shelf',
      `title ${this.id.value} claims ${this.#availableCount}, but ${actuallyOnShelf} are on the shelf`,
    )
  }
  // …
}
```

This is the expensive kind: it forces the objects into one cluster, one
transaction and one lock. Only pay for it when the rule genuinely cannot survive
being briefly false.

### 4. Across aggregates — **not an invariant at all**

See below. This is where the interesting mistakes happen.

---

## The rule that looks like an invariant and is not

> "A member may hold at most 8 loans at once."

Every instinct says invariant. It is not one, and `Member.assertInvariants()`
deliberately does not check it:

```ts
override assertInvariants(): void {
  if (this.#name.length === 0)   throw new InvariantViolation(/* … */)
  if (this.#activeLoans < 0)     throw new InvariantViolation(/* … */)
  if (this.#standing === 'Active' && this.#suspendedUntil !== undefined) throw /* … */
  // NOTE: no check that activeLoans <= allowance. On purpose.
}
```

### Why not

The rule spans `Member` and every one of their `Loan`s. An aggregate can only
guarantee what it owns entirely. To enforce this atomically you would have to
put all the loans inside `Member` — and then every borrow in the library takes a
lock on the member's whole history, forever, to protect a rule about a number.

### What it becomes instead

A **policy, checked at decision time**, with the counter repaired afterwards:

```ts
eligibilityToBorrow(now: Date): BorrowEligibility {
  if (this.isSuspendedAt(now))                return { allowed: false, reason: /* … */ }
  if (this.#activeLoans >= this.allowance)    return { allowed: false, reason: /* … */ }
  return { allowed: true }
}
```

Read the qualifier carefully: this is the best answer available from the
member's own state *at this instant*. It is not a guarantee that will still hold
when the loan commits. Treating it as one is how people convince themselves they
have transactional consistency when they do not.

### And when the race happens

```ts
loanTaken(at: Date): void {
  this.#activeLoans += 1

  if (this.#activeLoans > this.allowance) {
    this.record(new BorrowAllowanceExceeded({ /* … */ }))
  }
  this.assertInvariants()
}
```

It does not throw — and that is the important part. The loan **already exists**;
this method describes something that has already happened. Throwing would assert
that a committed fact is illegal, leaving the two aggregates permanently
disagreeing about reality, with a volume out and nothing tracking it.

So the overshoot is recorded and made visible. The library lent one book more
than its policy intended — something a librarian can sort out. **Silence would
be the bug.**

`tests/member.test.ts` pins both halves: the counter accepts the overshoot, and
`assertInvariants()` still passes.

---

## Invariants are not only about numbers

`HoldQueue` protects three rules, and only one is arithmetic:

1. a member holds at most one place in a queue;
2. a collect-by date exists **exactly** for allocated holds;
3. **entries are ordered by request time.**

Rule 3 deserves attention. If the entries stopped being sorted, nothing would
crash and no count would disagree — *"third in the queue"* would simply start
lying. Structural properties (ordering, uniqueness, referential closure) are
invariants too, and they tend to be the ones nobody writes down.

Rule 2 is a **cross-field** invariant: neither field is wrong on its own, only
the combination. These are invisible if you validate field by field, which is
why validation frameworks so rarely catch them.

---

## Refusal ≠ violation

The codebase keeps two error hierarchies apart, and the distinction is not
cosmetic:

| | `DomainError` | `InvariantViolation` |
|---|---|---|
| Means | the business says no | the model is inconsistent |
| Example | `NoCopyAvailable`, `BorrowingRefused` | available count ≠ copies on shelf |
| Expected? | yes, routinely | never |
| Right response | show the member a message | page someone; there is a bug |

Give them the same type and one day they will be handled the same way — usually
by a `catch` that logs and continues, which turns a corrupt aggregate into a
silent one.

There is a third category, deliberately not an exception at all: `BorrowBook`
returns a union.

```ts
export type BorrowOutcome =
  | { kind: 'lent'; loanId: LoanId; copyId: CopyId; dueAt: Date }
  | { kind: 'refused'; reason: string }
  | { kind: 'no-copy-available' }
```

"You are suspended" and "there is no copy today" are two of the three *normal*
answers, and the caller has something useful to do with each. Reserving
exceptions for genuine faults keeps the distinction meaningful — and stops
`catch` blocks becoming the place business logic hides.

---

## Where invariants are enforced in practice

```ts
// every mutating method on an aggregate
this.assertInvariants()

// foundation/ddd-core/src/testing/in-memory-repository.ts
async save(aggregate: TAggregate): Promise<void> {
  aggregate.assertInvariants()          // nothing inconsistent reaches storage
  this.store.set(aggregate.id.value, aggregate)
}

// foundation/event-bus/src/unit-of-work.ts
async commit(repository, aggregate) {
  aggregate.assertInvariants()          // refuse to write nonsense
  await repository.save(aggregate)
  await this.#publisher.publish(aggregate.pullDomainEvents())
}
```

Belt and braces, deliberately. `scenarios/04` breaks an aggregate by reaching
past its boundary and shows both the aggregate and the repository refusing it.

---

## Where to look in the code

| | |
|---|---|
| In a type | `foundation/shared-kernel/src/isbn.ts`, `money.ts` |
| In an entity | `library/inventory/src/domain/copy-status.ts` |
| Across an aggregate | `book-stock.ts` → `assertInvariants()` |
| Structural, non-numeric | `hold-queue.ts` → `assertInvariants()` |
| The rule that is a policy | `library/membership/src/domain/member.ts` |
| Error hierarchy | `foundation/ddd-core/src/errors.ts` |
| Scenario | `pnpm scenario:4` |

---

## Further reading

- **[Effective Aggregate Design, part 1](https://www.dddcommunity.org/wp-content/uploads/files/pdf_articles/Vernon_2011_1.pdf)**
  — Vaughn Vernon, 2011. Modelling *true* invariants inside a consistency
  boundary, and how to tell one from a rule that merely sounds absolute.
- **[Effective Aggregate Design, part 3](https://www.dddcommunity.org/wp-content/uploads/files/pdf_articles/Vernon_2011_3.pdf)**
  — Vaughn Vernon, 2011. What happens to a rule that spans two aggregates:
  eventual consistency, and who is accountable for the gap.
- **[Design validations in the domain model layer](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/domain-model-layer-validations)**
  — Microsoft. Where validation belongs when the model is meant to be
  always-valid, rather than constructed invalid and checked afterwards.

---

**Previous:** [← Entity vs Aggregate Root](03-entity-vs-aggregate.md) · **Next:** [Domain events →](05-domain-events.md)
