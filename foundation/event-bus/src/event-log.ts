import type { DomainEvent } from '@local/ddd-core'
import type { EventSubscriber, Unsubscribe } from './ports.js'

/**
 * Records every event that crosses the bus, so the scenarios can print a
 * transcript and the tests can assert on what was published.
 *
 * This is not a domain concept — it is a wiretap. Kept out of the contexts on
 * purpose: an aggregate should never know that anybody is listening.
 */
export class EventLog {
  readonly #events: DomainEvent[] = []
  #unsubscribe: Unsubscribe | undefined

  attachTo(subscriber: EventSubscriber): this {
    this.#unsubscribe?.()
    this.#unsubscribe = subscriber.onAny((event) => {
      this.#events.push(event)
    })
    return this
  }

  detach(): void {
    this.#unsubscribe?.()
    this.#unsubscribe = undefined
  }

  get events(): readonly DomainEvent[] {
    return [...this.#events]
  }

  names(): readonly string[] {
    return this.#events.map((event) => event.name)
  }

  countOf(eventName: string): number {
    return this.#events.filter((event) => event.name === eventName).length
  }

  clear(): this {
    this.#events.length = 0
    return this
  }

  /** Indented transcript, used by every scenario. */
  transcript(indent = '    '): string {
    if (this.#events.length === 0) return `${indent}(no events)`
    return this.#events.map((event) => `${indent}→ ${event.describe()}`).join('\n')
  }
}
