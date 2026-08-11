/**
 * # The playground island
 *
 * This file drives the real `BookStock` aggregate in the browser. Nothing here
 * is a simulation: `buildLibrary()` is the same composition root the six
 * terminal scenarios use, and the objects it wires up are the same classes the
 * 70 tests pin. The only difference is that the buttons are DOM elements
 * instead of lines in a script.
 *
 * That is possible because no domain package and no part of the composition
 * root imports anything from Node. See `composition/tsconfig.json`, where
 * `"types": []` makes that a compile error rather than a convention.
 *
 * ## The one rule this file must not break
 *
 * It may read domain rules. It may not restate them.
 *
 * Which buttons are offered comes from `LEGAL_TRANSITIONS`, exported by the
 * Inventory context — not from a list typed out here. A hand-written copy of a
 * domain rule in a UI is a second source of truth, and the second one is always
 * the one that goes stale. The aggregate still enforces every transition on
 * every call: the table decides what to *offer*, never what to *allow*.
 */

import { buildLibrary, seedLibrary, type Library } from '@local/composition'
import { DomainError, InvariantViolation, type DomainEvent } from '@local/ddd-core'
import {
  LEGAL_TRANSITIONS,
  type BookStock,
  type BookStockSnapshot,
  type CopySnapshot,
  type CopyStatus,
  type ShelfOperations,
} from '@local/library-inventory'
import { CopyId } from '@local/shared-kernel'
import type { TitleId } from '@local/shared-kernel'

// ─────────────────────────────────────────────────────────────────────────────
//  The command surface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A use case Inventory actually publishes, tagged with the transition it
 * performs so the UI can cross-reference it against `LEGAL_TRANSITIONS`.
 *
 * Note that this list is *shorter* than the transition table. That gap is not
 * an oversight, and the UI shows it rather than hiding it — see `ghostsFor`.
 */
interface CopyCommand {
  readonly label: string
  readonly from: readonly CopyStatus[]
  readonly to: CopyStatus
  readonly run: (shelf: ShelfOperations, titleId: TitleId, copyId: CopyId) => Promise<void>
}

const COPY_COMMANDS: readonly CopyCommand[] = [
  {
    label: 'Accept return',
    from: ['OnLoan'],
    to: 'Available',
    run: (shelf, titleId, copyId) => shelf.acceptReturn(titleId, copyId),
  },
  {
    label: 'Report damaged',
    from: ['Available', 'OnLoan'],
    to: 'Damaged',
    run: (shelf, titleId, copyId) => shelf.reportDamaged(titleId, copyId, 'water damage'),
  },
  {
    label: 'Report lost',
    from: ['OnLoan'],
    to: 'Lost',
    run: (shelf, titleId, copyId) => shelf.reportLost(titleId, copyId),
  },
  {
    label: 'Repair',
    from: ['Damaged'],
    to: 'Available',
    run: (shelf, titleId, copyId) => shelf.repair(titleId, copyId),
  },
]

/**
 * Why a legal transition has no button.
 *
 * Both answers are interesting, and they are different in kind. `OnLoan` is
 * reachable — just not one copy at a time, because a member borrows a *title*
 * and the shelf picks the volume. `Withdrawn` is simply a rule the model knows
 * and the application layer has not yet been asked to expose.
 */
const UNOFFERED_BECAUSE: Partial<Record<CopyStatus, string>> = {
  OnLoan:
    'Reachable only through “Lend any copy”. A member borrows a title, never a barcode — so no use case takes a copy id.',
  Withdrawn:
    'Legal in the model, but Inventory publishes no use case for it. The domain knows the rule; the application layer has not been asked for it.',
}

const ghostsFor = (status: CopyStatus, offered: readonly CopyCommand[]): readonly CopyStatus[] =>
  LEGAL_TRANSITIONS[status].filter((target) => !offered.some((command) => command.to === target))

// ─────────────────────────────────────────────────────────────────────────────
//  State
// ─────────────────────────────────────────────────────────────────────────────

interface LoggedEvent {
  /**
   * Which invocation this event belongs to — not just the label.
   *
   * Grouping by label alone merges three consecutive "Lend any copy" clicks
   * into one heading, which hides exactly what the panel is for: the third
   * lend publishes an availability event and the first two do not.
   */
  readonly commandId: number
  readonly command: string
  readonly event: DomainEvent
}

interface Outcome {
  readonly tone: 'accepted' | 'refused' | 'broken'
  readonly text: string
}

class Playground {
  #library!: Library
  #titleId!: TitleId
  #selected: string | undefined
  #events: LoggedEvent[] = []
  #outcome: Outcome | undefined
  #nextBarcode = 104
  #currentCommand = '(setup)'
  #commandId = 0
  #busy = false

  /**
   * Set by an action that wants to describe its own result.
   *
   * The break needs this: `#dispatch` would otherwise report "accepted", which
   * is true of the call and deeply misleading about what happened.
   */
  #pendingOutcome: Outcome | undefined

  constructor(private readonly root: HTMLElement) {}

  async start(): Promise<void> {
    await this.#reset()
    this.#wireControls()
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async #reset(): Promise<void> {
    this.#events = []
    this.#outcome = undefined
    this.#nextBarcode = 104
    this.#currentCommand = '(setup)'
    this.#commandId = 0

    this.#library = buildLibrary({
      onEvent: (event) => {
        this.#events.push({ commandId: this.#commandId, command: this.#currentCommand, event })
      },
    })

    const { dune } = await seedLibrary(this.#library)
    this.#titleId = dune
    this.#selected = 'LIB-000101'

    // `seedLibrary` clears the event log, so clear ours too — the reader should
    // start with an empty slate rather than three acquisitions they did not do.
    this.#events = []

    await this.#render()
  }

  async #stock(): Promise<BookStock> {
    const stock = await this.#library.stocks.findById(this.#titleId)
    if (stock === undefined) throw new Error('the seeded stock disappeared')
    return stock
  }

  // ── Running a command ─────────────────────────────────────────────────────

  /**
   * Every button goes through here, so there is exactly one place where a
   * command runs and an outcome is recorded.
   */
  async #dispatch(label: string, action: () => Promise<void>): Promise<void> {
    if (this.#busy) return
    this.#busy = true
    this.#commandId += 1
    this.#currentCommand = label
    this.#pendingOutcome = undefined

    try {
      await action()
      this.#outcome = this.#pendingOutcome ?? { tone: 'accepted', text: `${label} — accepted` }
    } catch (error) {
      if (error instanceof InvariantViolation) {
        // Reached `save()` with a broken aggregate. This is the model catching
        // its own corruption at the persistence boundary.
        this.#outcome = {
          tone: 'broken',
          text: `${label} — refused at save: ${error.message}`,
        }
      } else if (error instanceof DomainError) {
        // The business saying no. Not a bug — a rule doing its job.
        this.#outcome = { tone: 'refused', text: `${label} — ${error.message}` }
      } else {
        throw error
      }
    } finally {
      this.#busy = false
    }

    await this.#render()
  }

  // ── Controls that are not commands ────────────────────────────────────────

  #wireControls(): void {
    this.#on('[data-reset]', 'click', () => {
      void this.#reset()
    })

  }

  #on(selector: string, type: string, handler: () => void): void {
    this.root.querySelector(selector)?.addEventListener(type, handler)
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  async #render(): Promise<void> {
    const stock = await this.#stock()
    const snapshot = stock.snapshot()

    this.#renderStats(snapshot)
    this.#renderShelf(snapshot)
    this.#renderStockCommands(snapshot)
    this.#renderBreak(snapshot)
    this.#renderEvents()
    this.#renderOutcome()
  }

  #slot(name: string): HTMLElement {
    const element = this.root.querySelector<HTMLElement>(`[data-${name}]`)
    if (element === null) throw new Error(`playground markup is missing [data-${name}]`)
    return element
  }

  /**
   * The shelf, where each copy opens onto the commands its status allows.
   *
   * Previously the row and its commands lived in two different panels: you
   * clicked a barcode here and its buttons appeared in a box below, which asked
   * the reader to hold "which copy am I acting on?" in their head. Putting the
   * commands under the row they belong to makes the answer unmissable — and it
   * matters on this page in particular, because the whole lesson is that a
   * command is addressed to *something*, and going around that something is
   * what breaks the model.
   */
  #renderShelf(snapshot: BookStockSnapshot): void {
    const list = this.#slot('copies')
    list.replaceChildren()

    for (const copy of snapshot.copies) {
      const open = copy.copyId === this.#selected

      const item = document.createElement('li')
      item.className = 'pg-copy'
      item.dataset['status'] = copy.status
      if (open) item.dataset['selected'] = 'true'

      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'pg-copy-button'
      button.setAttribute('aria-expanded', String(open))
      button.innerHTML =
        `<span class="pg-barcode">${escapeHtml(copy.copyId)}</span>` +
        `<span class="pg-pill">${escapeHtml(copy.status)}</span>` +
        `<span class="pg-lent">${copy.timesLent}×</span>` +
        `<span class="pg-chevron" aria-hidden="true"></span>`
      button.addEventListener('click', () => {
        // A toggle, not a radio: clicking the open copy closes it. One copy at
        // a time, because the break zone below acts on "the copy you picked"
        // and two open rows would leave that phrase ambiguous.
        this.#selected = open ? undefined : copy.copyId
        void this.#render()
      })

      item.append(button)
      if (open) item.append(this.#copyDetail(copy))
      list.append(item)
    }
  }

  /**
   * What one copy can be asked to do, and what it legally could do but has no
   * use case for.
   *
   * `offered` is filtered from `COPY_COMMANDS`; the ghosts are whatever
   * `LEGAL_TRANSITIONS` permits that no command covers. Neither list is typed
   * out — the gap between them is computed, so it cannot go stale.
   */
  #copyDetail(copy: CopySnapshot): HTMLElement {
    const detail = document.createElement('div')
    detail.className = 'pg-copy-detail'

    const offered = COPY_COMMANDS.filter((command) => command.from.includes(copy.status))

    if (offered.length === 0) {
      const terminal = document.createElement('p')
      terminal.className = 'pg-terminal'
      terminal.textContent =
        `“${copy.status}” is a terminal state — ` +
        `LEGAL_TRANSITIONS lists no way out of it. A volume that is lost or ` +
        `withdrawn never comes back; if it turns up, it is a new acquisition ` +
        `with a new barcode, because the audit trail must keep saying the old ` +
        `one was lost.`
      detail.append(terminal)
    }

    const commands = document.createElement('div')
    commands.className = 'pg-commands'
    for (const command of offered) {
      commands.append(
        this.#button(command.label, true, () =>
          this.#dispatch(`${command.label} ${copy.copyId}`, () =>
            command.run(this.#library.shelf, this.#titleId, CopyId.of(copy.copyId)),
          ),
        ),
      )
    }
    detail.append(commands)

    const ghosts = ghostsFor(copy.status, offered)
    if (ghosts.length > 0) {
      const ghostRow = document.createElement('div')
      ghostRow.className = 'pg-ghosts'

      for (const ghost of ghosts) {
        const chip = document.createElement('span')
        chip.className = 'pg-ghost'
        chip.textContent = `→ ${ghost}`
        chip.title = UNOFFERED_BECAUSE[ghost] ?? 'No use case exposed for this transition.'
        ghostRow.append(chip)
      }

      const caption = document.createElement('p')
      caption.className = 'pg-ghost-caption'
      caption.textContent =
        'Legal in the model, no button here — hover to see why. The gap between ' +
        'the transition table and the use cases is the application layer.'
      ghostRow.append(caption)

      detail.append(ghostRow)
    }

    return detail
  }

  /**
   * Three numbers answering three different questions, and only equal at the
   * start.
   *
   * The first version of this was one line reading "3 copies", which was wrong
   * in the way this whole repository is about: `totalCopies` counts `Copy`
   * records, and a lost volume keeps its record forever so the audit trail can
   * say what happened to it. One English word was standing in for three ideas
   * — the same failure the README bans the word "book" for.
   *
   * `heldCount` came from the domain rather than being computed here, because
   * "which statuses mean we still have it" is a business rule and the UI is not
   * where business rules go.
   */
  #renderStats(snapshot: BookStockSnapshot): void {
    const slot = this.#slot('summary')
    slot.replaceChildren()

    // Deliberately not flagged when `availableCount` drifts from the copies.
    //
    // The page could compare the two and turn this red the instant the boundary
    // is bypassed — and that would be the same lie the removed invariant panel
    // told. Nothing in a real system notices, so nothing here does either. The
    // reader is asked to look instead, which is the actual experience of
    // finding this class of bug.
    const stat = (value: number, label: string, hint: string): void => {
      const block = document.createElement('div')
      block.className = 'pg-stat'
      block.title = hint
      block.innerHTML =
        `<span class="pg-stat-value">${value}</span>` +
        `<span class="pg-stat-label">${escapeHtml(label)}</span>`
      slot.append(block)
    }

    stat(
      snapshot.totalCopies,
      'on record',
      'Every Copy ever acquired, including lost and withdrawn ones — the record outlives the volume.',
    )
    stat(
      snapshot.heldCount,
      'held',
      'Volumes the library still physically has, wherever they are.',
    )
    stat(
      snapshot.availableCount,
      'available',
      'The aggregate’s own stored counter: volumes a member could borrow right now. This is the number that can drift.',
    )
  }

  #renderStockCommands(snapshot: BookStockSnapshot): void {
    const slot = this.#slot('stock-commands')
    slot.replaceChildren()

    const lend = this.#button('Lend any copy', snapshot.availableCount > 0, () =>
      this.#dispatch('Lend any copy', async () => {
        await this.#library.shelf.lendAnyCopy(this.#titleId)
      }),
    )
    lend.classList.add('pg-primary')
    lend.title =
      'A member borrows a title, not a barcode — the shelf chooses which volume goes out.'
    slot.append(lend)

    slot.append(
      this.#button('Acquire a copy', true, () => {
        const barcode = `LIB-000${this.#nextBarcode++}`
        return this.#dispatch(`Acquire ${barcode}`, () =>
          this.#library.acquireCopy.execute({ titleId: this.#titleId.value, barcode }),
        )
      }),
    )
  }

  /**
   * The boundary violation, with its consequences stated before you click.
   *
   * The previous version was a button labelled "Break the aggregate" and a
   * tooltip. That is not enough to explain what breaking an aggregate even
   * looks like — tooltips are invisible on touch, and "broken" is abstract
   * until you know which two numbers stopped agreeing. So this says what will
   * happen, in the concrete: this barcode, that counter, this number.
   */
  #renderBreak(snapshot: BookStockSnapshot): void {
    const commands = this.#slot('break-commands')
    const expect = this.#slot('break-expect')
    commands.replaceChildren()

    const copy = snapshot.copies.find((candidate) => candidate.copyId === this.#selected)

    if (copy === undefined) {
      expect.textContent = 'Open a copy on the shelf first — this acts on the one you picked.'
      return
    }

    // Only meaningful on an Available copy: `availableCount` counts exactly
    // those, so that is where bypassing the root has something to lose.
    const breakable = copy.status === 'Available'

    const button = this.#button(`💥 Damage ${copy.copyId} behind the root’s back`, breakable, () =>
      this.#dispatch(`Reach past the root and damage ${copy.copyId}`, async () => {
        const stock = await this.#stock()

        // The two lines the whole page exists for. `unsafeCopyForTeaching`
        // returns the live child; calling `reportDamaged` *on the Copy* skips
        // `BookStock.reportDamaged`, which is the only thing that would have
        // adjusted the counter.
        const leaked = stock.unsafeCopyForTeaching(CopyId.of(copy.copyId))
        leaked.reportDamaged('a caller reached past the root', this.#library.clock.now())

        this.#pendingOutcome = {
          tone: 'broken',
          text:
            `Reached past the root. ${copy.copyId} is now Damaged — but availableCount still ` +
            `says ${stock.availableCount}, because BookStock was never told. ` +
            `${stock.countInStatus('Available')} copies actually read Available. ` +
            `Nothing was published either: no aggregate saved, so there was nothing to announce.`,
        }
      }),
    )
    button.classList.add('pg-break')
    commands.append(button)

    expect.innerHTML = breakable
      ? `<strong>What to expect:</strong> ${copy.copyId} flips to Damaged, while the header ` +
        `still reads <strong>${snapshot.availableCount} available</strong> — the root was ` +
        `never told, so it never adjusted the counter it owns. Nothing is published and ` +
        `nothing complains. Follow the four steps below to catch it.`
      : `Pick an <strong>Available</strong> copy to try this. ` +
        `<code>availableCount</code> counts exactly those, so a copy that is already off the ` +
        `shelf gives the counter nothing to lose.`
  }

  #button(label: string, enabled: boolean, onClick: () => void | Promise<void>): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'pg-command'
    button.textContent = label
    button.disabled = !enabled
    button.addEventListener('click', () => {
      void onClick()
    })
    return button
  }

  #renderEvents(): void {
    const list = this.#slot('events')
    list.replaceChildren()

    this.#slot('event-count').textContent =
      this.#events.length === 0 ? '' : `(${this.#events.length})`

    if (this.#events.length === 0) {
      const empty = document.createElement('li')
      empty.className = 'pg-event-empty'

      // An empty list after a command is not a bug, and saying so is the whole
      // point: reaching past the root publishes nothing because the root never
      // learned anything happened, and a command refused at save publishes
      // nothing because `UnitOfWork` had no successful write to announce.
      empty.textContent =
        this.#commandId === 0
          ? 'No events yet. Run a command.'
          : 'Nothing published — no aggregate reached a successful save. ' +
            'Bypassing the root raises nothing, and a refused command announces nothing.'

      list.append(empty)
      return
    }

    let lastCommandId: number | undefined

    for (const { commandId, command, event } of this.#events) {
      if (commandId !== lastCommandId) {
        const header = document.createElement('li')
        header.className = 'pg-event-command'
        header.textContent = command
        list.append(header)
        lastCommandId = commandId
      }

      // `describe()` opens with the event's own name, so rendering both the
      // name chip and the full description printed it twice.
      const described = event.describe()
      const detail = described.startsWith(event.name)
        ? described.slice(event.name.length).trim()
        : described

      const item = document.createElement('li')
      item.className = 'pg-event'

      // Event names are `<context>.<what-happened>`, so the prefix says which
      // bounded context raised it. Tinting by context makes a cross-context
      // reaction visible as a colour change: an inventory event, then a lending
      // event nobody explicitly asked for.
      item.dataset['context'] = event.name.split('.')[0] ?? 'other'

      item.innerHTML =
        `<code class="pg-event-name">${escapeHtml(event.name)}</code>` +
        `<span class="pg-event-description">${escapeHtml(detail)}</span>`
      list.append(item)
    }
  }

  #renderOutcome(): void {
    const slot = this.#slot('outcome')
    if (this.#outcome === undefined) {
      slot.textContent = ''
      slot.removeAttribute('data-tone')
      return
    }
    slot.dataset['tone'] = this.#outcome.tone
    slot.textContent = this.#outcome.text
  }
}

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
  )

// ─────────────────────────────────────────────────────────────────────────────
//  Mount
// ─────────────────────────────────────────────────────────────────────────────

const mountAll = (): void => {
  for (const root of document.querySelectorAll<HTMLElement>('[data-playground]')) {
    if (root.dataset['mounted'] === 'true') continue
    root.dataset['mounted'] = 'true'
    void new Playground(root).start()
  }
}

mountAll()
// Starlight ships a client-side router, so a page can arrive without a reload.
document.addEventListener('astro:page-load', mountAll)
