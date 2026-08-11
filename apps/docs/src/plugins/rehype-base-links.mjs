import { visit } from 'unist-util-visit'

/**
 * Prefixes hand-written root-relative links with the site's `base`.
 *
 * ## The problem
 *
 * GitHub Pages serves a project site from a subdirectory, so this site lives at
 * `/municipal-library/` rather than `/`. Astro applies `base` to asset URLs and
 * to links its own components emit, but it does **not** rewrite hrefs written by
 * hand in Markdown — those are opaque strings in a text file, and Astro has no
 * grounds to assume `/concepts/01-entity/` means "a page on this site" rather
 * than "a path on this domain".
 *
 * Which means `[Entity](/concepts/01-entity/)` resolves to
 * `formica-fusca.github.io/concepts/01-entity/` and 404s. There are thirty of
 * these across the content, and hand-editing each one has two costs: it makes
 * the deployment target leak into every document, and it breaks the same links
 * when read on GitHub, where there is no base at all.
 *
 * ## Why rehype and not remark
 *
 * A remark plugin sees Markdown `link` nodes, which is only part of the story:
 * this content also contains raw HTML anchors, JSX in `.mdx`, and the `<a>` that
 * `remark-mermaid` above emits inside a raw `html` node. By rehype time every
 * one of those is an `element` with a `properties.href`, so a single visitor
 * covers all of them and cannot be outflanked by an author writing HTML.
 *
 * ## What it deliberately leaves alone
 *
 * - `//example.com` — protocol-relative, an external host despite the leading `/`
 * - anything already inside `base`, so a second pass or a pre-prefixed link is
 *   idempotent rather than doubled
 * - every other href: absolute URLs, `#anchors`, `./relative` paths, `mailto:`
 *
 * With `base: '/'` — a custom domain, or local dev — this is a no-op, so the
 * plugin never needs unpicking if the deployment moves.
 */
export default function rehypeBaseLinks({ base = '/' } = {}) {
  const prefix = base.replace(/\/$/, '')
  if (prefix === '') return () => {}

  return (tree) => {
    visit(tree, 'element', (node) => {
      if (node.tagName !== 'a') return

      const href = node.properties?.href
      if (typeof href !== 'string') return
      if (!href.startsWith('/') || href.startsWith('//')) return
      if (href === prefix || href.startsWith(`${prefix}/`)) return

      node.properties.href = `${prefix}${href}`
    })
  }
}
