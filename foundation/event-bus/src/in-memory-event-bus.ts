import type { DomainEvent } from '@local/ddd-core'
import type {
  EventHandler,
  EventPublisher,
  EventSubscriber,
  EventType,
  Unsubscribe,
} from './ports.js'

export interface EventBusOptions {
  /**
   * Called when a handler throws. Defaults to writing to stderr.
   *
   * A handler failing must not take down the publisher: the change that raised
   * the event has *already been committed*, and rolling the caller back would
   * be a lie. See the note on failure isolation in `publish()`.
   */
  onHandlerError?: (error: unknown, event: DomainEvent) => void
}

/**
 * A publish/subscribe bus small enough to read in one sitting.
 *
 * ## Deliberate design choices
 *
 * **Dispatch is sequential and awaited.** Handlers run one at a time, in
 * registration order, and `publish()` does not resolve until all of them have.
 * Concurrency would make the scenario transcripts non-deterministic and would
 * teach nothing extra. A production bus would hand off to a queue here — and
 * that difference is precisely the difference between *eventual* consistency
 * you can observe and eventual consistency you have to reason about.
 *
 * **Handlers are isolated from each other.** One throwing does not prevent the
 * others from running, and does not propagate to the publisher.
 *
 * **Events raised by handlers are published normally.** A handler that commits
 * another aggregate produces its own events, which dispatch as part of that
 * nested `publish()` call. That is how a `CopyReturned` in inventory ends up
 * allocating a hold in lending without either context importing the other.
 */
export class InMemoryEventBus implements EventPublisher, EventSubscriber {
  readonly #handlersByName = new Map<string, Set<EventHandler>>()
  readonly #wildcardHandlers = new Set<EventHandler>()
  readonly #onHandlerError: (error: unknown, event: DomainEvent) => void

  constructor(options: EventBusOptions = {}) {
    this.#onHandlerError =
      options.onHandlerError ??
      ((error, event) => {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`[event-bus] handler for ${event.name} failed: ${reason}`)
      })
  }

  on<TEvent extends DomainEvent>(
    type: EventType<TEvent>,
    handler: EventHandler<TEvent>,
  ): Unsubscribe {
    return this.onName(type.eventName, handler as EventHandler)
  }

  onName(eventName: string, handler: EventHandler): Unsubscribe {
    const handlers = this.#handlersByName.get(eventName) ?? new Set<EventHandler>()
    handlers.add(handler)
    this.#handlersByName.set(eventName, handlers)
    return () => {
      handlers.delete(handler)
    }
  }

  onAny(handler: EventHandler): Unsubscribe {
    this.#wildcardHandlers.add(handler)
    return () => {
      this.#wildcardHandlers.delete(handler)
    }
  }

  async publish(events: readonly DomainEvent[]): Promise<void> {
    for (const event of events) {
      const subscribed = this.#handlersByName.get(event.name) ?? new Set<EventHandler>()

      // Snapshot before iterating: a handler is allowed to subscribe or
      // unsubscribe while running, and mutating a Set mid-iteration is how you
      // get bugs nobody can reproduce.
      const handlers = [...this.#wildcardHandlers, ...subscribed]

      for (const handler of handlers) {
        try {
          await handler(event)
        } catch (error) {
          this.#onHandlerError(error, event)
        }
      }
    }
  }

  /** Number of registered handlers, for assertions in the tests. */
  handlerCount(eventName?: string): number {
    if (eventName === undefined) {
      let total = this.#wildcardHandlers.size
      for (const handlers of this.#handlersByName.values()) total += handlers.size
      return total
    }
    return this.#handlersByName.get(eventName)?.size ?? 0
  }
}
