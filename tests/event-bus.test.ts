import { AggregateRoot, DomainEvent, Identifier, type Repository } from '@local/ddd-core'
import { InMemoryRepository } from '@local/ddd-core/testing'
import { EventLog, InMemoryEventBus, UnitOfWork } from '@local/event-bus'
import { describe, expect, it, vi } from 'vitest'

class NoteId extends Identifier {
  declare protected readonly _tag: 'NoteId'
  private constructor(value: string) {
    super(value)
  }
  static of(value: string): NoteId {
    return new NoteId(value)
  }
}

class NoteWritten extends DomainEvent {
  static readonly eventName = 'test.note-written'
  readonly name = NoteWritten.eventName
  readonly text: string

  constructor(text: string) {
    super()
    this.text = text
  }

  payload() {
    return { text: this.text }
  }
}

class Note extends AggregateRoot<NoteId> {
  #broken = false

  constructor(id: NoteId) {
    super(id)
  }

  write(text: string): void {
    this.record(new NoteWritten(text))
  }

  breakIt(): void {
    this.#broken = true
  }

  override assertInvariants(): void {
    if (this.#broken) throw new Error('note is broken')
  }
}

const buildBus = () => {
  const bus = new InMemoryEventBus({ onHandlerError: () => {} })
  const log = new EventLog().attachTo(bus)
  return { bus, log }
}

describe('InMemoryEventBus', () => {
  it('delivers to handlers subscribed by event class, with the payload typed', async () => {
    const { bus } = buildBus()
    const seen: string[] = []

    bus.on(NoteWritten, (event) => {
      // `event` is a NoteWritten here — no cast needed at the call site.
      seen.push(event.text)
    })

    await bus.publish([new NoteWritten('hello')])
    expect(seen).toEqual(['hello'])
  })

  it('isolates handlers from one another', async () => {
    const errors: unknown[] = []
    const bus = new InMemoryEventBus({ onHandlerError: (error) => errors.push(error) })
    const second = vi.fn()

    bus.on(NoteWritten, () => {
      throw new Error('handler exploded')
    })
    bus.on(NoteWritten, second)

    // The change that raised this event has already been committed. A handler
    // failing must not propagate back to the publisher.
    await expect(bus.publish([new NoteWritten('x')])).resolves.toBeUndefined()
    expect(second).toHaveBeenCalledOnce()
    expect(errors).toHaveLength(1)
  })

  it('stops delivering after unsubscribe', async () => {
    const { bus } = buildBus()
    const handler = vi.fn()
    const unsubscribe = bus.on(NoteWritten, handler)

    await bus.publish([new NoteWritten('a')])
    unsubscribe()
    await bus.publish([new NoteWritten('b')])

    expect(handler).toHaveBeenCalledOnce()
  })

  it('lets a handler publish further events (this is how contexts chain)', async () => {
    const { bus, log } = buildBus()

    bus.on(NoteWritten, async (event) => {
      if (event.text === 'first') await bus.publish([new NoteWritten('second')])
    })

    await bus.publish([new NoteWritten('first')])
    expect(log.countOf(NoteWritten.eventName)).toBe(2)
  })
})

describe('UnitOfWork — dispatch after commit', () => {
  it('publishes only after the save succeeds', async () => {
    const { bus, log } = buildBus()
    const repository: Repository<Note, NoteId> = new InMemoryRepository<Note, NoteId>()
    const unitOfWork = new UnitOfWork(bus)

    const note = new Note(NoteId.of('N-1'))
    note.write('committed')

    await unitOfWork.commit(repository, note)
    expect(log.countOf(NoteWritten.eventName)).toBe(1)
  })

  it('publishes nothing when the aggregate is inconsistent', async () => {
    const { bus, log } = buildBus()
    const repository: Repository<Note, NoteId> = new InMemoryRepository<Note, NoteId>()
    const unitOfWork = new UnitOfWork(bus)

    const note = new Note(NoteId.of('N-2'))
    note.write('never happened')
    note.breakIt()

    await expect(unitOfWork.commit(repository, note)).rejects.toThrow(/broken/)

    // The crucial assertion: no handler ran on the strength of a change that
    // was never written. The event is still buffered on the aggregate.
    expect(log.countOf(NoteWritten.eventName)).toBe(0)
    expect(note.hasPendingEvents).toBe(true)
  })

  it('never replays history when the same aggregate is committed twice', async () => {
    const { bus, log } = buildBus()
    const repository: Repository<Note, NoteId> = new InMemoryRepository<Note, NoteId>()
    const unitOfWork = new UnitOfWork(bus)

    const note = new Note(NoteId.of('N-3'))
    note.write('once')

    await unitOfWork.commit(repository, note)
    await unitOfWork.commit(repository, note)

    expect(log.countOf(NoteWritten.eventName)).toBe(1)
  })
})
