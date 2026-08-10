import { visit } from 'unist-util-visit'

/**
 * Turns ```mermaid fences into `<pre class="mermaid">` blocks.
 *
 * ## Why a remark plugin rather than a rehype one
 *
 * Syntax highlighting runs later in the pipeline, and Shiki has no `mermaid`
 * grammar — it would either fail or render the diagram source as unstyled code.
 * Replacing the node during the remark pass, with a raw `html` node, takes the
 * block out of the pipeline before highlighting ever sees it.
 *
 * ## Why the escaping matters
 *
 * Mermaid node labels contain markup: `<b>Inventory</b><br/>BookStock`. Emitted
 * raw, the browser would parse those as real elements, and `textContent` — which
 * is how the client reads the diagram source back — would return the labels with
 * the tags silently stripped. Escaping them means the browser stores literal
 * characters and `textContent` hands mermaid exactly what was written.
 */
const escapeHtml = (value) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export default function remarkMermaid() {
  return (tree) => {
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang !== 'mermaid' || parent === undefined || index === undefined) return

      parent.children[index] = {
        type: 'html',
        value: `<figure class="mermaid-figure"><pre class="mermaid">${escapeHtml(node.value)}</pre></figure>`,
      }
    })
  }
}
