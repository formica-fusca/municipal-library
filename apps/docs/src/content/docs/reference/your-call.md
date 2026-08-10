---
title: Two calls left to you
description: Two genuine design decisions, shipped with working defaults and documented alternatives.
sidebar:
  order: 4
---

Two places in the model are real design decisions rather than settled facts.
Both ship with a working implementation so the project runs end to end, and
both are marked `👉 YOUR CALL` in the source with their alternatives spelled
out.

---

## 1 · Whose turn is it when a copy comes back?

**`packages/library/lending/src/domain/hold-allocation-policy.ts`**

Expressed as an injectable **Domain Policy** — the Strategy pattern applied to a
business rule — because this genuinely varies between libraries, and because it
is the kind of rule a domain expert should be able to change without anyone
rewriting an aggregate.

```ts
export interface HoldAllocationPolicy {
  readonly description: string
  chooseNext(candidates: readonly HoldCandidate[], now: Date): HoldCandidate | undefined
}
```

### What ships

`StrictFifoAllocation` — first come, first served, no exceptions. Defensible:
queue fairness is easy to explain at the counter, and "the person who waited
longest gets the book" is a rule nobody argues with.

### The alternatives

| Policy | Argument for | Cost |
|---|---|---|
| **Skip the ineligible** (`SkipIneligibleAllocation`, also shipped) | Allocating to a suspended member wastes the 48-hour window — the copy sits on the hold shelf helping nobody | A member can lose their place through no fault of their own |
| **Priority tiers** | Staff or accessibility needs jump the queue | You must be able to defend that ordering to the person it skipped |
| **Expire-aware round-robin** | A member who already let one hold lapse goes to the back | Needs history this context does not currently keep |

### Writing your own

Implement the interface — around eight lines — and pass it to `HoldDesk`:

```ts
const holdDesk = new HoldDesk({
  /* … */
  allocationPolicy: new YourPolicy(),
})
```

A policy needing knowledge from outside Lending — *"is this member suspended?"*
lives in Membership — receives it through its **constructor**, gathered by the
application service before the call. The aggregate method stays pure: given a
queue and a policy, the outcome is deterministic and unit-testable with no
repositories in sight.

`tests/hold-queue.test.ts` pins the FIFO behaviour, so you will see immediately
which assertions your rule changes.

---

## 2 · What happens when a race pushes a member past their allowance?

**`packages/library/membership/src/domain/member.ts`**, in `loanTaken()`

Two borrow requests can both pass the eligibility check before either commits.
The second one to arrive here finds the member already at their limit — and the
loan **already exists**.

```ts
loanTaken(at: Date): void {
  this.#activeLoans += 1

  if (this.#activeLoans > this.allowance) {
    this.record(new BorrowAllowanceExceeded({ /* … */ }))
  }
  this.assertInvariants()
}
```

### The three answers

**(a) Record `BorrowAllowanceExceeded` and carry on** — what ships. Honest: the
overshoot is visible, a librarian can act on it, and the model never lies about
how many volumes are actually out.

**(b) Throw.** Tempting, and a trap. This method describes something that has
*already happened*; refusing it would assert that a committed fact is illegal.
The member record would then permanently under-count, and a volume would be out
in the world with nothing tracking it.

**(c) Also auto-suspend the member.** Defensible if repeated overshoot signals
abuse — but it turns a race condition into a punishment, which is hard to explain
to the person standing at the counter.

`tests/member.test.ts` pins the current answer, including the assertion that
`assertInvariants()` still passes while the member is over their allowance. That
is not an oversight: see [Invariants](/concepts/04-invariants/) for why the
allowance is a policy rather than an invariant.

