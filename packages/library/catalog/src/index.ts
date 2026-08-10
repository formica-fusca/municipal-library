/**
 * The published language of the Catalogue context.
 *
 * Everything another context is allowed to know about catalogue lives here. The
 * folder structure inside (`domain/`, `application/`, `infrastructure/`) is
 * this context's private business — nobody imports a deep path, so nobody can
 * accidentally depend on an internal.
 */
export { RegisterTitle } from './application/register-title.js'
export type { RegisterTitleCommand } from './application/register-title.js'
export { TitleRegistered, TitleWithdrawnFromCatalogue } from './domain/events.js'
export type { TitleRepository } from './domain/title-repository.js'
export { Title } from './domain/title.js'
export type { TitleSnapshot } from './domain/title.js'
export { InMemoryTitleRepository } from './infrastructure/in-memory-title-repository.js'
