import { execFile } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)

/**
 * Runs each scenario script and writes its real console output into the docs
 * site as a page.
 *
 * ## Why capture rather than hand-write
 *
 * A transcript pasted into a document is correct exactly once. These pages are
 * regenerated on every `dev` and `build`, from the same scripts a reader would
 * run themselves — so if a change to the model alters what the library prints,
 * the documentation changes with it or the build fails. Prose can drift from
 * the code; captured output cannot.
 *
 * The generated directory is git-ignored for the same reason: checking it in
 * would create a second copy that is free to go stale.
 */

const REPO_ROOT = new URL('../../../', import.meta.url)
const OUT_DIR = new URL('../src/content/docs/scenarios/', import.meta.url)

interface Scenario {
  readonly file: string
  readonly title: string
  readonly description: string
  /** Written above the transcript. What the reader should be watching for. */
  readonly intro: string
}

const SCENARIOS: readonly Scenario[] = [
  {
    file: '01-acquire-and-shelve',
    title: 'Cataloguing a title',
    description:
      'Value objects that cannot be invalid, and why an event fires on an edge rather than on every change.',
    intro: `A title is catalogued and three physical volumes reach the shelves.

Two things are worth watching for. First, \`Isbn.of()\` refuses a mistyped ISBN
before any aggregate exists — an invariant enforced in a constructor is enforced
everywhere, for free.

Second, and easy to miss: three copies arrive, and
\`inventory.title-became-available\` fires **once**. \`BookStock\` announces the
*edge* — nothing on the shelf becoming something on the shelf — not every change
to the number. Going from one copy to two is nobody else's business, and
publishing it would invite subscribers to make decisions from a count they cannot
trust to still be current.`,
  },
  {
    file: '02-borrow-and-return',
    title: 'A loan, from counter to counter',
    description:
      'One aggregate per transaction, a counter kept in step by an event, and a use case triggered by the calendar.',
    intro: `The ordinary life of a loan: borrowed, overdue, returned, then found damaged.

Read the first event list carefully. \`BorrowBook\` modified exactly **one**
aggregate — the new \`Loan\`. The stock changed inside Inventory's own
transaction behind a port, and Alice's loan counter was not touched by the use
case at all: a subscriber on \`lending.loan-opened\` did that, a moment later.

The overdue sweep is a *time-driven* use case — nobody requested it, the calendar
did — and running it twice produces one notice, because
\`Loan.announceOverdue()\` is idempotent by construction.

At the end, \`inventory.copy-damaged\` is recorded by the **Copy entity**, not by
its root. Scenario 5 takes that apart.`,
  },
  {
    file: '03-hold-queue',
    title: 'The hold queue',
    description:
      'A second aggregate root with child entities, ordering as an invariant, and an injected allocation policy.',
    intro: `Five members, three copies, and a queue.

The centre of this transcript is what happens when Alice returns her copy. Follow
the chain and notice that no single file contains it:

1. \`ReturnBook\` calls \`shelf.acceptReturn()\`
2. Inventory raises \`inventory.title-became-available\`
3. a subscriber in \`subscriptions.ts\` calls \`HoldDesk.allocateOnAvailability()\`
4. \`HoldQueue\` picks the front of the queue

Inventory does not import Lending. Lending does not import Inventory. Each end
knows only the event.

Later, when Denis fails to collect, \`lending.hold-expired\` is recorded by the
**HoldRequest child** — it alone knows its own deadline passed — while
\`lending.hold-allocated\` is recorded by the **HoldQueue root**, because being
chosen ahead of everyone else cannot be known from inside a single request.`,
  },
  {
    file: '04-invariants-under-attack',
    title: 'Invariants under attack',
    description:
      'Every rule in the model attacked on purpose — and then an aggregate deliberately broken by reaching past its boundary.',
    intro: `Every rule in the model, attacked deliberately.

The first sections show invariants doing their job, and the distinction between a
**refusal** (\`DomainError\` — the business said no, print it at the counter) and
a **violation** (\`InvariantViolation\` — the model is inconsistent, page
someone).

The last section does the opposite. \`unsafeCopyForTeaching()\` hands out a live
\`Copy\` entity — precisely what an aggregate exists to prevent — and a caller
mutates it without the root noticing. The count and the shelf then disagree, and
both the aggregate and the repository refuse it.

That is the entire argument for aggregate boundaries, in six lines of output.`,
  },
  {
    file: '05-can-an-entity-emit-an-event',
    title: 'Can an entity emit a domain event?',
    description:
      'The question this repository was built to answer, demonstrated with a working aggregate and a deliberately broken one.',
    intro: `The question that motivated the whole repository — see
[Domain events](/concepts/05-domain-events/) for the same argument in prose.

The transcript separates two verbs the question conflates: a child entity may
**record**, only the root can cause anything to be **published**.

Part 2 is the part worth staring at. Two aggregates differ by four lines, and one
of them silently loses every event its children ever record. Nothing throws, no
state is wrong, and no test that only asserts on state would ever notice.`,
  },
  {
    file: '06-two-models-of-stock',
    title: 'Two models of "stock"',
    description:
      'The same word modelled two irreconcilable ways, twenty metres apart, and both correct.',
    intro: `The library and the shop annex both hold copies of *Dune* on shelves.
Both call it "stock". The models share nothing but an ISBN.

The library can answer *"which volume is damaged?"* and must be able to —
overdue notices name a volume, the hold shelf holds a volume. The shop **cannot**
answer *"which copy did we sell?"*, and never needs to.

The closing point: identity is not a property of the thing. It is a property of
what your business needs to say about the thing.`,
  },
]

const ANSI = /\[[0-9;]*[A-Za-z]/g

const stripAnsi = (text: string): string => text.replace(ANSI, '')

/**
 * Trailing whitespace on a line inside a fenced block is invisible here and
 * shows up as a diff later. Trim it, and collapse any run of blank lines the
 * narrator produced.
 */
const tidy = (transcript: string): string =>
  transcript
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

async function capture(scenario: Scenario, index: number): Promise<void> {
  const script = `apps/scenarios/src/${scenario.file}.ts`
  const tsx = fileURLToPath(new URL('node_modules/.bin/tsx', REPO_ROOT))

  const { stdout } = await run(tsx, [script], {
    cwd: fileURLToPath(REPO_ROOT),
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1' },
  })

  const order = index + 1
  const page = `---
title: ${order} · ${scenario.title}
description: ${JSON.stringify(scenario.description)}
sidebar:
  order: ${order}
---

${scenario.intro}

Run it yourself:

\`\`\`bash
pnpm scenario:${order}
\`\`\`

## Transcript

<div class="transcript">

\`\`\`text
${tidy(stripAnsi(stdout))}
\`\`\`

</div>

:::note[Generated, not written]
This transcript is captured from \`${script}\` every time the site is built. If
the model changes what the library prints, this page changes with it.
:::
`

  await writeFile(new URL(`${scenario.file}.md`, OUT_DIR), page, 'utf8')
  console.log(`  ✓ ${scenario.file}`)
}

async function main(): Promise<void> {
  console.log('Building the workspace so the scenarios can run…')
  await run(fileURLToPath(new URL('node_modules/.bin/tsc', REPO_ROOT)), ['-b'], {
    cwd: fileURLToPath(REPO_ROOT),
    maxBuffer: 16 * 1024 * 1024,
  })

  await rm(OUT_DIR, { recursive: true, force: true })
  await mkdir(OUT_DIR, { recursive: true })

  console.log('Capturing scenario transcripts…')
  for (const [index, scenario] of SCENARIOS.entries()) {
    await capture(scenario, index)
  }

  console.log(`Captured ${SCENARIOS.length} transcripts into src/content/docs/scenarios/`)
}

await main()
