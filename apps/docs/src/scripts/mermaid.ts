import mermaid from 'mermaid'

/**
 * Renders every `<pre class="mermaid">` on the page, and re-renders when the
 * reader flips Starlight's light/dark switch.
 *
 * Rendering client-side rather than at build time is a deliberate trade: it
 * costs a moment on first paint, and it saves the project a headless-Chromium
 * dependency (~150 MB, plus a real CI install step) for the sake of two
 * diagrams.
 */

/**
 * The original source, kept per element.
 *
 * Needed because after the first render the element's `textContent` is the
 * generated SVG markup, not the diagram source — so a theme change would
 * otherwise try to render an SVG as a flowchart.
 */
const sources = new WeakMap<HTMLElement, string>()

let renderCount = 0

const isDark = (): boolean => document.documentElement.dataset['theme'] === 'dark'

async function renderAll(): Promise<void> {
  const blocks = Array.from(document.querySelectorAll<HTMLElement>('pre.mermaid'))
  if (blocks.length === 0) return

  mermaid.initialize({
    startOnLoad: false,
    theme: isDark() ? 'dark' : 'default',
    // Our own authored content, but `strict` costs nothing here: DOMPurify
    // leaves the `<b>` and `<br/>` used in node labels intact.
    securityLevel: 'strict',
    // Deliberately NOT `inherit`. Mermaid measures label widths itself, then
    // renders inside a `<pre>` — so inheriting the pre's monospace font while
    // mermaid sized the boxes for a proportional one clips every label. Letting
    // mermaid use its own font keeps measurement and rendering in agreement.
    flowchart: { curve: 'basis', htmlLabels: true, useMaxWidth: true },
  })

  for (const block of blocks) {
    let source = sources.get(block)
    if (source === undefined) {
      source = block.textContent ?? ''
      sources.set(block, source)
    }

    try {
      renderCount += 1
      const { svg } = await mermaid.render(`mermaid-diagram-${renderCount}`, source)
      block.innerHTML = svg
      block.dataset['rendered'] = 'true'
    } catch (error) {
      // A broken diagram should not take the page down with it — leave the
      // source visible so the mistake is at least readable.
      block.dataset['rendered'] = 'failed'
      console.error('[mermaid] failed to render a diagram', error)
    }
  }
}

const start = (): void => {
  void renderAll()

  // Starlight stamps `data-theme` on <html> when the reader toggles the theme.
  new MutationObserver(() => void renderAll()).observe(document.documentElement, {
    attributeFilter: ['data-theme'],
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true })
} else {
  start()
}
