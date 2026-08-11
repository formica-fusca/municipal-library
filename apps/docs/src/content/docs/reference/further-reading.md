---
title: Further reading
description: The original sources behind every pattern this repository demonstrates, grouped to follow the concept documents.
sidebar:
  order: 5
---

Nothing in this repository is an original idea. This page says whose ideas they
are and where to read them first-hand, grouped in the order the concept
documents introduce them.

Each concept document ends with the two or three sources most directly behind
it. This page collects those, plus the wider reading that belongs to no single
document.

---

## Start here

- **[Domain-Driven Design: Tackling Complexity in the Heart of Software](https://www.domainlanguage.com/ddd/)**
  — Eric Evans, Addison-Wesley, 2003.
  The book the whole vocabulary comes from: Entity, Value Object, Aggregate,
  Repository, Domain Event, Bounded Context, Ubiquitous Language. Long, and the
  second half — on strategic design and context boundaries — is the half most
  people skip.

- **[Domain-Driven Design Reference](https://www.domainlanguage.com/ddd/reference/)**
  — Eric Evans, 2015. Free PDF.
  The pattern definitions from the book, extracted and lightly updated, with the
  worked examples removed. Around fifty pages, and the fastest way to check what
  a term meant in the original rather than in a blog post about it.

- **[Effective Aggregate Design](https://dddcommunity.org/library/vernon_2011/)**
  — Vaughn Vernon, 2011. Three PDFs.
  Written after the book, in response to how often aggregates were being drawn
  too large. Part 1 argues for small aggregates around true invariants, part 2
  for referencing other aggregates by identity, part 3 for eventual consistency
  between them.

- **[Domain-Driven Design](https://martinfowler.com/bliki/DomainDrivenDesign.html)**
  — Martin Fowler.
  A one-page definition, and the entry point to
  [everything he has tagged DDD](https://martinfowler.com/tags/domain%20driven%20design.html).

---

## Entity and Value Object

Concept document: [Entity](/concepts/01-entity/)

- **[Evans Classification](https://martinfowler.com/bliki/EvansClassification.html)**
  — Martin Fowler.
  How Evans divides a domain model into Entities, Value Objects and Services,
  and why the distinction is about identity rather than about which one holds
  more data.

- **[Value Object](https://martinfowler.com/bliki/ValueObject.html)**
  — Martin Fowler.
  Equality by attribute rather than by identity, and the case for making value
  objects immutable so that two references to the same value cannot diverge.

- **[Implement value objects](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/implement-value-objects)**
  — Microsoft, .NET microservices guide.
  The same idea taken down to implementation: structural equality, and how value
  objects are persisted when the storage layer only understands rows.

---

## Aggregates

Concept documents: [Aggregate Root](/concepts/02-aggregate-root/) ·
[Entity vs Aggregate Root](/concepts/03-entity-vs-aggregate/)

- **[DDD_Aggregate](https://martinfowler.com/bliki/DDD_Aggregate.html)**
  — Martin Fowler.
  An aggregate as a cluster of objects treated as one unit for data changes,
  with the root as the only member anything outside may hold a reference to.

- **[Effective Aggregate Design, part 1](https://www.dddcommunity.org/wp-content/uploads/files/pdf_articles/Vernon_2011_1.pdf)**
  — Vaughn Vernon, 2011. PDF.
  The rule that a consistency boundary should contain exactly what a true
  invariant spans, and a worked example of an aggregate being made smaller.

- **[Effective Aggregate Design, part 2](https://www.dddcommunity.org/wp-content/uploads/files/pdf_articles/Vernon_2011_2.pdf)**
  — Vaughn Vernon, 2011. PDF.
  Referencing other aggregates by identity instead of by object reference, and
  what that costs at the point of use.

- **[Repository](https://martinfowler.com/eaaCatalog/repository.html)**
  — Martin Fowler, *Patterns of Enterprise Application Architecture*, 2002.
  The catalogue entry for the pattern: a collection-like interface between the
  domain and the data mapping layer. The one-repository-per-aggregate-root rule
  comes from Evans rather than from here.

- **[Tell Don't Ask](https://martinfowler.com/bliki/TellDontAsk.html)**
  — Martin Fowler.
  Not a DDD article, but the principle behind an aggregate exposing behaviour
  instead of exposing its internals for callers to manipulate.

---

## Invariants and consistency

Concept document: [Invariants](/concepts/04-invariants/)

- **[Effective Aggregate Design, part 3](https://www.dddcommunity.org/wp-content/uploads/files/pdf_articles/Vernon_2011_3.pdf)**
  — Vaughn Vernon, 2011. PDF.
  What happens to a rule that spans two aggregates: eventual consistency, who
  is accountable for the gap, and how to decide whether the gap is acceptable.

- **[Design validations in the domain model layer](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/domain-model-layer-validations)**
  — Microsoft, .NET microservices guide.
  Where validation belongs when the model is meant to be always-valid, and the
  argument against constructing an invalid object and checking it afterwards.

---

## Domain events

Concept document: [Domain events](/concepts/05-domain-events/)

- **[Domain Event](https://martinfowler.com/eaaDev/DomainEvent.html)**
  — Martin Fowler, 2005.
  The original pattern write-up: an object capturing the memory of something
  that happened, as distinct from the state change it caused.

- **[What do you mean by "Event-Driven"?](https://martinfowler.com/articles/201701-event-driven.html)**
  — Martin Fowler, 2017.
  Separates four things the phrase is used for — event notification,
  event-carried state transfer, event sourcing and CQRS — which is useful
  because arguments about domain events are often arguments about which of the
  four is meant.

- **[Domain Events — Salvation](https://udidahan.com/2009/06/14/domain-events-salvation/)**
  — Udi Dahan, 2009.
  The post most of the online debate descends from. Raises events from inside
  entities and defers their dispatch, and is the source of the objection this
  repository's document 5 answers.

- **[Domain events: design and implementation](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/domain-events-design-implementation)**
  — Microsoft, .NET microservices guide.
  Buffering events on the aggregate and dispatching them around the transaction
  boundary, and the distinction between a domain event and an integration event
  that leaves the service.

- **[Patterns for decoupling in distributed systems: explicit public events](https://verraes.net/2019/05/patterns-for-decoupling-distsys-explicit-public-events/)**
  — Mathias Verraes, 2019.
  Argues that an internal domain event and a published event are different
  things with different compatibility obligations, and that publishing the
  internal one couples subscribers to your model.

- **[Unit of Work](https://martinfowler.com/eaaCatalog/unitOfWork.html)**
  — Martin Fowler, *Patterns of Enterprise Application Architecture*, 2002.
  The object that tracks what a business transaction touched and coordinates
  writing it out — the hook that makes "publish only after commit" expressible.

- **[Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html)**
  — Martin Fowler, 2005.
  The pattern this repository does *not* use: the event log as the system of
  record, with current state derived by replay. Worth reading to see where the
  boundary is.

- **[CQRS](https://martinfowler.com/bliki/CQRS.html)**
  — Martin Fowler, 2011.
  Separate models for reading and writing. Frequently packaged together with
  domain events; the note here on when it is *not* worth the cost is the useful
  part.

---

## Bounded contexts

Concept document: [Two models of stock](/concepts/06-two-models-of-stock/)

- **[Bounded Context](https://martinfowler.com/bliki/BoundedContext.html)**
  — Martin Fowler.
  Why one unified model across a whole organisation fails, and what it means for
  the same word to name two different things in two contexts.

- **[Ubiquitous Language](https://martinfowler.com/bliki/UbiquitousLanguage.html)**
  — Martin Fowler.
  The language shared by developers and domain experts, and the point that it
  is structured by the model rather than merely agreed in a glossary.

- **[Anemic Domain Model](https://martinfowler.com/bliki/AnemicDomainModel.html)**
  — Martin Fowler, 2003.
  The anti-pattern of objects that hold data while all behaviour lives in
  services. Worth reading before deciding whether a genuinely simple aggregate
  is anaemic or just small.

---

## Architecture and context integration

Concept document: [Architecture](/concepts/07-architecture/)

- **[Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/)**
  — Alistair Cockburn.
  Ports and adapters, from the person who named them: the application defines
  the interface, and everything external is an interchangeable implementation
  of it.

- **[Anti-corruption Layer](https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer)**
  — Microsoft, Azure architecture patterns.
  A translation layer at a context boundary so that one model's vocabulary does
  not leak into another's.

- **[Context Mapping](https://github.com/ddd-crew/context-mapping)**
  — DDD Crew.
  The relationship patterns between bounded contexts — shared kernel, customer
  and supplier, conformist, anti-corruption layer, published language — as a set
  of diagrams and definitions.

- **[Domain Model](https://martinfowler.com/eaaCatalog/domainModel.html)**
  — Martin Fowler, *Patterns of Enterprise Application Architecture*, 2002.
  The catalogue entry the whole approach sits on, and its comparison against
  Transaction Script — which is often the right answer for a simple context.

---

Every link on this page was checked on 2026-08-11.
