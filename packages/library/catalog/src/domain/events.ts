import { DomainEvent } from '@local/ddd-core'
import type { Isbn, TitleId } from '@local/shared-kernel'

export class TitleRegistered extends DomainEvent {
  static readonly eventName = 'catalog.title-registered'
  readonly name = TitleRegistered.eventName

  readonly titleId: string
  readonly isbn: string
  readonly heading: string

  constructor(params: { titleId: TitleId; isbn: Isbn; heading: string; occurredAt: Date }) {
    super(params.occurredAt)
    this.titleId = params.titleId.value
    this.isbn = params.isbn.value
    this.heading = params.heading
  }

  payload() {
    return { titleId: this.titleId, isbn: this.isbn, heading: this.heading }
  }
}

export class TitleWithdrawnFromCatalogue extends DomainEvent {
  static readonly eventName = 'catalog.title-withdrawn'
  readonly name = TitleWithdrawnFromCatalogue.eventName

  readonly titleId: string
  readonly reason: string

  constructor(params: { titleId: TitleId; reason: string; occurredAt: Date }) {
    super(params.occurredAt)
    this.titleId = params.titleId.value
    this.reason = params.reason
  }

  payload() {
    return { titleId: this.titleId, reason: this.reason }
  }
}
