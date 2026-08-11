/**
 * The published surface of the composition root.
 *
 * Note what is *not* here: `ShelfAdapter`, `BorrowerDirectoryAdapter` and
 * `SequentialIds` stay module-private. They are how the contexts are joined,
 * not something a delivery mechanism should be able to take apart — an app
 * that could construct a `ShelfAdapter` itself could construct a *different*
 * one, and then there would be two answers to "how does Lending reach the
 * shelf?" instead of one.
 */

export { buildLibrary, seedLibrary } from './wiring.js'
export type { Library, LibraryOptions } from './wiring.js'

