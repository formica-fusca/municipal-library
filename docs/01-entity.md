# Entity

> An object defined by **who it is**, not by **what it holds**.

---

## The idea

Take a copy of *Dune* off the shelf, barcode `LIB-000102`. Lend it out. It comes
back with a torn spine. Rebind it. Move it to another branch. Lend it again.

Every attribute has changed. It is still the same copy. A member who says *"the
one I had last month"* means that object, and the library must be able to agree.

That thread of continuity through change is what an Entity is. Everything else —
identity fields, equality methods, repositories — is machinery in service of it.

The counter-example makes it sharper: **money**. Two ten-euro notes are
interchangeable. If someone swapped yours for another while you were not
looking, nothing in the world would have changed. Money has no identity, so it
is a Value Object.

---

## The consequence: equality ignores attributes

```ts
// foundation/ddd-core/src/lib/entity.ts
equals(other: Entity<Identifier> | null | undefined): boolean {
  if (other === null || other === undefined) return false
  if (other === this) return true
  if (other.constructor !== this.constructor) return false
  return this.id.equals(other.id)          // ← and nothing else
}
```

Two `Copy` objects loaded separately from the repository — one of them stale,
loaded before the damage was recorded — are still *the same copy*. That is not
a compromise; it is the correct answer. They describe one physical object at two
moments in its life.

This is the single most reliable test in practice:

> If two instances with different attribute values can still be *the same thing*,
> you have an Entity. If two instances with identical attributes are
> interchangeable, you have a Value Object.

---

## Identity is not an `id` column

A database primary key is a storage detail. Identity is a *domain* concept, and
it usually exists in the real world before your system does. In this library:

- a `Copy` is identified by the **barcode sticker** physically inside the cover;
- a `Member` by the **number on their card**;
- a `Title` by a catalogue reference.

None of those were invented by the software. When you find yourself generating
a UUID because "everything needs an id", pause: either you have found an entity
whose real-world identity you have not identified yet, or — more often — you
have a Value Object that does not need one at all.

### Making identity type-safe

`TitleId` and `MemberId` are both a string in a wrapper. Left as bare `string`s,
nothing stops this:

```ts
borrowBook.execute({ memberId: titleId, titleId: memberId })   // compiles fine 😱
```

So each subclass of `Identifier` declares a distinct tag:

```ts
// foundation/shared-kernel/src/identities.ts
export class TitleId extends Identifier {
  declare protected readonly _tag: 'TitleId'
  private constructor(value: string) { super(value) }
  static of(value: string): TitleId { return new TitleId(value) }
}
```

Two details are doing the work:

- **`protected` + differing literal types** makes the classes mutually
  unassignable. TypeScript's structural typing gives way to nominal typing when
  a non-public member is involved.
- **`declare`** means the field exists only in the type system. It emits no
  JavaScript at all, so this safety is genuinely free at runtime.

The private constructor forces `TitleId.of(...)`, which is where the "not blank"
rule lives.

---

## Entities have behaviour, and their own rules

An Entity is not a bag of fields with getters. It owns the rules that can be
checked *from inside it alone*.

`Copy` owns its lifecycle:

```ts
// library/inventory/src/domain/copy-status.ts
export const LEGAL_TRANSITIONS: Readonly<Record<CopyStatus, readonly CopyStatus[]>> = {
  Available: ['OnLoan', 'Damaged', 'Withdrawn'],
  OnLoan:    ['Available', 'Damaged', 'Lost'],
  Damaged:   ['Available', 'Withdrawn'],
  Lost:      [],
  Withdrawn: [],
}
```

`Available → Lost` is absent, and that absence is a business statement: a volume
can only be lost while somebody *has* it. Found sitting on the shelf, it is not
lost — it is there.

Notice that this rule needs no knowledge of any other copy. That is precisely
why it belongs on the entity rather than on the aggregate root. Rules that need
to see siblings belong to whoever can see them, which is the next document.

The table is data rather than a chain of `if` statements for two reasons: a
domain expert can read it, and each transition method stays three lines instead
of thirty.

---

## Entities record events, but cannot publish them

```ts
protected record(event: DomainEvent): void {
  this.#recordedEvents.push(event)
}
```

`record()` is `protected` — only the entity's own behaviour may state what
happened to it, so an application service cannot fabricate history from outside.
The buffer is a `#private` field, so not even a subclass can reach into it.

And that is the whole of an Entity's power over events: it can *describe*. It
has no bus, no publisher, no route out. The only exit is its aggregate root
draining the buffer, and only when the root is committed.

That mechanism, and the reasoning behind it, is
[document 5](05-domain-events.md).

---

## Where to look in the code

| | |
|---|---|
| Base class | `foundation/ddd-core/src/lib/entity.ts` |
| Identity | `foundation/ddd-core/src/lib/identifier.ts` |
| A child entity | `library/inventory/src/domain/copy.ts` |
| Another one | `library/lending/src/domain/hold-request.ts` |
| The contrast | `foundation/ddd-core/src/lib/value-object.ts`, `foundation/shared-kernel/src/isbn.ts` |
| Tests | `tests/ddd-core.test.ts` |

---

## Further reading

- **[Evans Classification](https://martinfowler.com/bliki/EvansClassification.html)**
  — Martin Fowler. How Evans divides a model into Entities, Value Objects and
  Services, and why the line between the first two is identity rather than size.
- **[Value Object](https://martinfowler.com/bliki/ValueObject.html)**
  — Martin Fowler. Equality by attribute, and the case for immutability.
- **[Domain-Driven Design Reference](https://www.domainlanguage.com/ddd/reference/)**
  — Eric Evans, 2015. The original definitions, free, in about fifty pages.

---

**Next:** [Aggregate Root →](02-aggregate-root.md)
