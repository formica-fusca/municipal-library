export { AggregateRoot } from "./lib/aggregate-root.js";
export {
  addDays,
  addHours,
  daysBetween,
  FixedClock,
  systemClock,
} from "./lib/clock.js";
export type { Clock } from "./lib/clock.js";
export { DomainEvent } from "./lib/domain-event.js";
export type { DomainEventName } from "./lib/domain-event.js";
export { Entity } from "./lib/entity.js";
export {
  DomainError,
  IllegalStateTransition,
  InvariantViolation,
  NotFoundInAggregate,
} from "./lib/errors.js";
export { Identifier } from "./lib/identifier.js";
export type { Repository } from "./lib/repository.js";
export { ValueObject } from "./lib/value-object.js";
