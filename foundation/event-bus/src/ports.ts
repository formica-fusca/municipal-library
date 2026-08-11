import type { DomainEvent } from '@local/ddd-core'

export type EventHandler<TEvent extends DomainEvent = DomainEvent> = (
  event: TEvent,
) => void | Promise<void>

export type Unsubscribe = () => void

/**
 * A handle on an event *class*, used so that subscribing infers the payload
 * type without a cast at the call site:
 *
 * ```ts
 * bus.on(CopyReturned, (event) => event.copyId)   // event is CopyReturned
 * ```
 *
 * The `prototype` field is the trick: every class declaration structurally
 * satisfies it, and it carries the instance type. Using a constructor signature
 * instead would exclude the classes here whose constructors are private.
 */
export interface EventType<TEvent extends DomainEvent> {
  readonly eventName: string
  readonly prototype: TEvent
}

/**
 * The write side of the bus. Application services depend on *this*, never on
 * the concrete bus — swapping the in-process implementation for one that writes
 * to SQS should not touch a single line of application code.
 */
export interface EventPublisher {
  publish(events: readonly DomainEvent[]): Promise<void>
}

/** The read side. Wiring code depends on this. */
export interface EventSubscriber {
  on<TEvent extends DomainEvent>(
    type: EventType<TEvent>,
    handler: EventHandler<TEvent>,
  ): Unsubscribe
  onName(eventName: string, handler: EventHandler): Unsubscribe
  onAny(handler: EventHandler): Unsubscribe
}
