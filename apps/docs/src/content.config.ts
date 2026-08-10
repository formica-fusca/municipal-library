import { docsLoader } from '@astrojs/starlight/loaders'
import { docsSchema } from '@astrojs/starlight/schema'
import { defineCollection } from 'astro:content'
import type { Loader, LoaderContext } from 'astro/loaders'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

/**
 * # Why this file is more than three lines
 *
 * The seven concept documents live in `docs/` at the repository root, and they
 * stay there, byte for byte. They are not copied into this app, and they carry
 * no frontmatter — so they keep rendering cleanly on GitHub, in an editor
 * preview, and in a `less` pager, which is where most people will actually meet
 * them.
 *
 * Starlight normally requires a `title` in frontmatter. Rather than add one to
 * every file (GitHub renders YAML frontmatter as a visible table above the
 * content), this loader derives everything it needs from the markdown itself:
 *
 * - **title** — the first `# ` heading
 * - **description** — the blockquote directly beneath it
 * - **sidebar order** — the numeric filename prefix
 *
 * It then makes three edits *in memory only*, so that prose written for GitHub
 * reads correctly as a website. See `prepareForStarlight` below.
 *
 * The alternative — a sync step copying the files into `src/content/docs/` with
 * generated frontmatter — would have worked too, and been more conventional.
 * It was rejected because two copies of a document is two documents, and one of
 * them is always the stale one.
 */

/** `apps/docs/src/` → repository root `docs/`. */
const REPO_DOCS = new URL('../../../docs/', import.meta.url)

const SIDEBAR_GROUP = 'concepts'

interface PreparedDoc {
  readonly title: string
  readonly description: string
  readonly body: string
  readonly order: number
}

// ─────────────────────────────────────────────────────────────────────────────
//  Markdown → Starlight
// ─────────────────────────────────────────────────────────────────────────────

/** `docs/03-entity-vs-aggregate.md` → 3 */
const orderFromFilename = (filename: string): number => Number(filename.slice(0, 2))

const titleFrom = (markdown: string): string | undefined =>
  /^#[^#\n]\s*(.+?)\s*$/m.exec(markdown)?.[1]

/**
 * The blockquote under the H1 — every document opens with a one-sentence
 * definition, which is exactly what a meta description and a search result
 * snippet want.
 */
const descriptionFrom = (markdown: string): string => {
  const afterHeading = markdown.replace(/^[\s\S]*?^#[^#\n].*$\n/m, '')
  const quoted = /^(?:>.*\n?)+/m.exec(afterHeading.trimStart())?.[0] ?? ''

  return quoted
    .split('\n')
    .map((line) => line.replace(/^>\s?/, '').trim())
    .join(' ')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/[*`]/g, '')
    .trim()
}

/**
 * Three edits, applied to the in-memory copy only:
 *
 * 1. **Drop the H1.** Starlight renders the title as the page's `<h1>`; leaving
 *    the original in would give every page two of them, which is both a styling
 *    problem and an accessibility one.
 *
 * 2. **Drop the hand-written Previous/Next footer.** It is the right thing in a
 *    folder of files you navigate with your eyes, and redundant next to
 *    Starlight's own pagination — which also stays correct when the order
 *    changes.
 *
 * 3. **Rewrite relative links.** `[document 5](05-domain-events.md)` resolves
 *    on GitHub and 404s on a website. Rewriting here means the source files
 *    keep the form that works where they are written.
 */
const prepareForStarlight = (markdown: string): string =>
  markdown
    .replace(/^#[^#\n].*$\n+/m, '')
    .replace(/\n---\n+\*\*(?:Previous|Next|Back)[\s\S]*$/, '\n')
    .replace(/\]\((\d{2}-[a-z-]+)\.md\)/g, `](/${SIDEBAR_GROUP}/$1/)`)
    .replace(/\]\(\.\.\/README\.md\)/g, '](/)')
    .replace(/\]\(docs\/(\d{2}-[a-z-]+)\.md\)/g, `](/${SIDEBAR_GROUP}/$1/)`)

const prepare = (filename: string, raw: string): PreparedDoc => {
  const title = titleFrom(raw)

  if (title === undefined) {
    throw new Error(
      `docs/${filename} has no top-level "# " heading, so this loader cannot ` +
        `derive a title for it. Add one, or give the file frontmatter.`,
    )
  }

  return {
    title,
    description: descriptionFrom(raw),
    body: prepareForStarlight(raw),
    order: orderFromFilename(filename),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  The loader
// ─────────────────────────────────────────────────────────────────────────────

const repositoryDocsLoader: Loader = {
  name: 'repository-docs',

  async load({ store, parseData, renderMarkdown, generateDigest, logger }: LoaderContext) {
    const directory = fileURLToPath(REPO_DOCS)
    const filenames = (await readdir(directory)).filter((name) => name.endsWith('.md')).sort()

    for (const filename of filenames) {
      const raw = await readFile(new URL(filename, REPO_DOCS), 'utf8')
      const doc = prepare(filename, raw)

      const id = `${SIDEBAR_GROUP}/${filename.replace(/\.md$/, '')}`

      store.set({
        id,
        data: await parseData({
          id,
          data: {
            title: doc.title,
            description: doc.description,
            sidebar: { order: doc.order },
          },
        }),
        body: doc.body,
        digest: generateDigest(doc.body),
        rendered: await renderMarkdown(doc.body),

        // Starlight's `autogenerate` builds its sidebar tree by stripping
        // `src/content/docs/` off `filePath` and treating what remains as a
        // directory path. It never opens the file. Handing it the real location
        // (`../../docs/01-entity.md`) would survive the strip untouched and
        // produce a sidebar nested under two `..` directories, so this is the
        // path the entry *would* have if it lived inside the app.
        filePath: `src/content/docs/${id}.md`,
      })
    }

    logger.info(`Loaded ${filenames.length} concept documents from docs/`)

    // This runs on every build and every dev-server start, so a build always
    // reflects the current contents of `docs/`. It does *not* re-run when a file
    // changes while the dev server is up — see the note at the top of
    // `astro.config.mjs`. Restart `pnpm docs:dev` to pick up an edit.
  },
}

/**
 * Two sources, one collection: the pages authored inside this app (landing
 * page, scenario transcripts, reference tables) and the repository's `docs/`.
 *
 * Order matters — Starlight's own loader clears the store when it runs, so it
 * goes first.
 */
const combined: Loader = {
  name: 'app-pages-and-repository-docs',
  async load(context) {
    await docsLoader().load(context)
    await repositoryDocsLoader.load(context)
  },
}

export const collections = {
  docs: defineCollection({ loader: combined, schema: docsSchema() }),
}
