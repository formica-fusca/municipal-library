/**
 * # The composition root
 *
 * This is the only package in the repository that depends on more than one
 * bounded context, and that is the architecture rather than an accident. Every
 * connection between contexts is one of exactly two things, and each has a
 * module of its own so that neither can be added quietly:
 *
 * 1. **An adapter** implementing a port that the consuming context declared —
 *    `adapters.ts`.
 * 2. **A subscription** on the event bus — `subscriptions.ts`.
 *
 * Nothing else crosses a border. `grep -rn "from '@local/library-inventory'"
 * library/ bookshop/` returns nothing, and `tsc -b` enforces it: the contexts
 * do not list each other as dependencies, so an import would not resolve.
 *
 * ## Why this is a package and not part of an app
 *
 * A composition root says *how the parts connect*; an app says *how a human
 * drives them*. There are two of the latter here — six narrated scripts and a
 * browser playground — and only one of the former, which is the point. Folding
 * this into either app would make that app's medium the definition of how the
 * library is assembled.
 *
 * `tsconfig.json` gives this package `"types": []`, so it cannot reach for
 * `console` or `process` even by accident. The `onEvent` option exists because
 * of that constraint: printing an event is the app's job, in whatever
 * vocabulary its medium has.
 *
 * ## What is deliberately not exported
 *
 * `ShelfAdapter`, `BorrowerDirectoryAdapter` and `SequentialIds` stay inside the
 * package. They are how the contexts are joined, not something a delivery
 * mechanism should be able to take apart — an app that could construct a
 * `ShelfAdapter` itself could construct a *different* one, and then there would
 * be two answers to "how does Lending reach the shelf?" instead of one.
 */

export { buildLibrary } from "./lib/wiring.js";
export { seedLibrary } from "./lib/seed.js";
export type { Library, LibraryOptions } from "./lib/library.js";
