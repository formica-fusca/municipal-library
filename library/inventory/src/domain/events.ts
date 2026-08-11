import { DomainEvent } from '@local/ddd-core'
import type { CopyId, TitleId } from '@local/shared-kernel'

/*
 * ─────────────────────────────────────────────────────────────────────────────
 *  Events recorded by the AGGREGATE ROOT (`BookStock`)
 *
 *  These describe the cluster as a whole. Only the root can know them: no
 *  individual copy can tell you that the library has just run out.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export class CopyAcquired extends DomainEvent {
  static readonly eventName = 'inventory.copy-acquired'
  readonly name = CopyAcquired.eventName

  readonly titleId: string
  readonly copyId: string

  constructor(params: { titleId: TitleId; copyId: CopyId; occurredAt: Date }) {
    super(params.occurredAt)
    this.titleId = params.titleId.value
    this.copyId = params.copyId.value
  }

  payload() {
    return { titleId: this.titleId, copyId: this.copyId }
  }
}

export class CopyCheckedOut extends DomainEvent {
  static readonly eventName = 'inventory.copy-checked-out'
  readonly name = CopyCheckedOut.eventName

  readonly titleId: string
  readonly copyId: string

  constructor(params: { titleId: TitleId; copyId: CopyId; occurredAt: Date }) {
    super(params.occurredAt)
    this.titleId = params.titleId.value
    this.copyId = params.copyId.value
  }

  payload() {
    return { titleId: this.titleId, copyId: this.copyId }
  }
}

export class CopyReturned extends DomainEvent {
  static readonly eventName = 'inventory.copy-returned'
  readonly name = CopyReturned.eventName

  readonly titleId: string
  readonly copyId: string

  constructor(params: { titleId: TitleId; copyId: CopyId; occurredAt: Date }) {
    super(params.occurredAt)
    this.titleId = params.titleId.value
    this.copyId = params.copyId.value
  }

  payload() {
    return { titleId: this.titleId, copyId: this.copyId }
  }
}

/**
 * The availability edge that matters to the rest of the library: stock went
 * from nothing on the shelf to something on the shelf.
 *
 * The Lending context subscribes to exactly this to wake up its hold queue. It
 * does *not* subscribe to `CopyReturned`, because a return that still leaves
 * the shelf empty (the copy came back damaged) is not news to anybody waiting.
 * Modelling the edge rather than the raw change is what keeps the handler
 * honest.
 */
export class TitleBecameAvailable extends DomainEvent {
  static readonly eventName = 'inventory.title-became-available'
  readonly name = TitleBecameAvailable.eventName

  readonly titleId: string
  readonly availableCount: number

  constructor(params: { titleId: TitleId; availableCount: number; occurredAt: Date }) {
    super(params.occurredAt)
    this.titleId = params.titleId.value
    this.availableCount = params.availableCount
  }

  payload() {
    return { titleId: this.titleId, availableCount: this.availableCount }
  }
}

export class TitleOutOfStock extends DomainEvent {
  static readonly eventName = 'inventory.title-out-of-stock'
  readonly name = TitleOutOfStock.eventName

  readonly titleId: string

  constructor(params: { titleId: TitleId; occurredAt: Date }) {
    super(params.occurredAt)
    this.titleId = params.titleId.value
  }

  payload() {
    return { titleId: this.titleId }
  }
}

/*
 * ─────────────────────────────────────────────────────────────────────────────
 *  Events recorded by a CHILD ENTITY (`Copy`)
 *
 *  These describe one physical volume, and the volume is the only object that
 *  holds the knowledge: its condition. The root still publishes them — see
 *  `AggregateRoot.pullDomainEvents` and `docs/05-domain-events.md`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export class CopyDamaged extends DomainEvent {
  static readonly eventName = 'inventory.copy-damaged'
  readonly name = CopyDamaged.eventName

  readonly titleId: string
  readonly copyId: string
  readonly reason: string

  constructor(params: { titleId: TitleId; copyId: CopyId; reason: string; occurredAt: Date }) {
    super(params.occurredAt)
    this.titleId = params.titleId.value
    this.copyId = params.copyId.value
    this.reason = params.reason
  }

  payload() {
    return { titleId: this.titleId, copyId: this.copyId, reason: this.reason }
  }
}

export class CopyRepaired extends DomainEvent {
  static readonly eventName = 'inventory.copy-repaired'
  readonly name = CopyRepaired.eventName

  readonly titleId: string
  readonly copyId: string

  constructor(params: { titleId: TitleId; copyId: CopyId; occurredAt: Date }) {
    super(params.occurredAt)
    this.titleId = params.titleId.value
    this.copyId = params.copyId.value
  }

  payload() {
    return { titleId: this.titleId, copyId: this.copyId }
  }
}

export class CopyLost extends DomainEvent {
  static readonly eventName = 'inventory.copy-lost'
  readonly name = CopyLost.eventName

  readonly titleId: string
  readonly copyId: string

  constructor(params: { titleId: TitleId; copyId: CopyId; occurredAt: Date }) {
    super(params.occurredAt)
    this.titleId = params.titleId.value
    this.copyId = params.copyId.value
  }

  payload() {
    return { titleId: this.titleId, copyId: this.copyId }
  }
}

export class CopyWithdrawn extends DomainEvent {
  static readonly eventName = 'inventory.copy-withdrawn'
  readonly name = CopyWithdrawn.eventName

  readonly titleId: string
  readonly copyId: string
  readonly reason: string

  constructor(params: { titleId: TitleId; copyId: CopyId; reason: string; occurredAt: Date }) {
    super(params.occurredAt)
    this.titleId = params.titleId.value
    this.copyId = params.copyId.value
    this.reason = params.reason
  }

  payload() {
    return { titleId: this.titleId, copyId: this.copyId, reason: this.reason }
  }
}
