import { unified } from '@astrojs/markdown-remark'
import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'
import { fileURLToPath } from 'node:url'
import rehypeBaseLinks from './src/plugins/rehype-base-links.mjs'
import remarkMermaid from './src/plugins/remark-mermaid.mjs'

/** Kept in one constant: the config below and the link plugin must agree. */
const BASE = '/municipal-library'

/**
 * Injects the client-side mermaid renderer into every page.
 *
 * `injectScript('page', …)` is used rather than a `<script>` in Starlight's
 * `head` config because the injected module goes through Vite: mermaid is
 * bundled from `node_modules`, not fetched from a CDN, so the site has no
 * external runtime dependency and works offline.
 */
const mermaidClient = {
  name: 'municipal-library:mermaid-client',
  hooks: {
    'astro:config:setup': ({ injectScript }) => {
      const module = fileURLToPath(new URL('./src/scripts/mermaid.ts', import.meta.url))
      injectScript('page', `import ${JSON.stringify(module)}`)
    },
  },
}

/*
 * ─────────────────────────────────────────────────────────────────────────────
 *  Known limitation: no live reload for `docs/*.md`
 *
 *  The concept documents are loaded from outside `srcDir`, and the dev server
 *  does not notice when they change. Three approaches were tried and none
 *  worked: re-running the loader from `LoaderContext.watcher` (updates the data
 *  store, but the rendered page module stays cached); adding the directory to
 *  Vite's watcher (Vite ignores paths outside the project root); and watching
 *  it with `fs.watch` plus `server.restart()` (the restart does not re-run the
 *  content sync).
 *
 *  So: **restart `pnpm docs:dev` to see an edit to `docs/*.md`.** Pages authored
 *  inside this app hot-reload normally, and `pnpm docs:build` always reflects
 *  the current files — that part is covered by a check in the verification run,
 *  and it is the part that would actually ship something stale.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export default defineConfig({
  /*
   * Deployed to GitHub Pages as a *project* site, which serves from a
   * subdirectory rather than the domain root:
   *
   *   https://formica-fusca.github.io/municipal-library/
   *   └──────────── site ───────────┘└───── base ──────┘
   *
   * `base` is the part that has teeth. Astro prefixes it onto asset URLs and
   * onto links its own components generate, but *not* onto hrefs written by
   * hand in Markdown — `/concepts/01-entity/` would resolve against the domain
   * root and 404. `rehypeBaseLinks` closes that gap; see the plugin for why it
   * runs over the HTML tree rather than the Markdown one.
   *
   * If this ever moves to a custom domain, set `base: '/'` and the plugin
   * becomes a no-op rather than something to unpick.
   */
  site: 'https://formica-fusca.github.io',
  base: BASE,

  markdown: {
    // Astro 7 replaced `markdown.remarkPlugins` with an explicit processor.
    // Starlight's own plugins (asides, heading anchors, …) are appended to
    // whatever is configured here, so this extends the pipeline rather than
    // replacing it.
    processor: unified({
      remarkPlugins: [remarkMermaid],
      rehypePlugins: [[rehypeBaseLinks, { base: BASE }]],
    }),
  },

  integrations: [
    mermaidClient,
    starlight({
      title: 'Municipal Library',
      description:
        'An educational showcase of Domain-Driven Design, built around a public library that lends physical books — and a small shop annex that sells them.',
      tagline: 'Domain-Driven Design, demonstrated rather than asserted',

      // Rendered by Starlight's own `SocialIcons`, which `HeaderNav` delegates
      // to — so this reaches the header without touching the override, and
      // rides along into `MobileMenuFooter` for free.
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/formica-fusca/municipal-library',
        },
      ],

      customCss: ['./src/styles/custom.css'],

      // Starlight has no top-nav configuration; overriding `SocialIcons` is how
      // the playground link reaches the header. See the component for why that
      // slot and not another — the short version is that `MobileMenuFooter`
      // renders it too, so one override covers desktop and mobile.
      components: {
        SocialIcons: './src/components/HeaderNav.astro',
        // Only there to base-prefix the landing page's action links, which
        // Starlight reads from frontmatter and passes through untouched.
        Hero: './src/components/Hero.astro',
      },

      // Every document opens with a definition rather than a preamble, so a
      // deeper table of contents is genuinely useful here.
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },

      lastUpdated: false,

      sidebar: [
        {
          label: 'Concepts',
          // Ordered by the numeric prefix on each file in `docs/`, which the
          // loader turns into `sidebar.order`.
          items: [{ autogenerate: { directory: 'concepts' } }],
        },
        {
          label: 'Scenarios',
          items: [{ autogenerate: { directory: 'scenarios' } }],
        },
        {
          label: 'Reference',
          items: [{ autogenerate: { directory: 'reference' } }],
        },
      ],
    }),
  ],
})
