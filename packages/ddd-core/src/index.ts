export { AggregateRoot } from './aggregate-root.js'
export { addDays, addHours, daysBetween, FixedClock, systemClock } from './clock.js'
export type { Clock } from './clock.js'
export { DomainEvent } from './domain-event.js'
export type { DomainEventName } from './domain-event.js'
export { Entity } from './entity.js'
export {
  DomainError,
  IllegalStateTransition,
  InvariantViolation,
  NotFoundInAggregate,
} from './errors.js'
export { Identifier } from './identifier.js'
export type { Repository } from './repository.js'
export { ValueObject } from './value-object.js'
