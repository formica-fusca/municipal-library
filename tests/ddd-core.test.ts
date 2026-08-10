import { AggregateRoot, DomainEvent, Entity, Identifier, ValueObject } from '@local/ddd-core'
import { describe, expect, it } from 'vitest'

/*
 * These tests pin the behaviour of the building blocks themselves — in
 * particular the mechanism that lets a child entity's events reach the bus,
 * which is the question this repository was built around.
 */

class ThingId extends Identifier {
  declare protected readonly _tag: 'ThingId'
  private constructor(value: string) {
    super(value)
  }
  static of(value: string): ThingId {
    return new ThingId(value)
  }
}

class OtherId extends Identifier {
  declare protected readonly _tag: 'OtherId'
  private constructor(value: string) {
    super(value)
  }
  static of(value: string): OtherId {
    return new OtherId(value)
  }
}

class Poked extends DomainEvent {
  static readonly eventName = 'test.poked'
  readonly name = Poked.eventName
  readonly who: string

  constructor(who: string) {
    super()
    this.who = who
  }

  payload() {
    return { who: this.who }
  }
}

class Child extends Entity<ThingId> {
  constructor(id: ThingId) {
    super(id)
  }
  poke(): void {
    this.record(new Poked(this.id.value))
  }
}

class ForgetfulRoot extends AggregateRoot<ThingId> {
  protected readonly children: Child[] = []

  constructor(id: ThingId) {
    super(id)
  }

  addChild(id: ThingId): Child {
    const child = new Child(id)
    this.children.push(child)
    return child
  }

  pokeSelf(): void {
    this.record(new Poked(`root:${this.id.value}`))
  }

  override assertInvariants(): void {}
}

class AttentiveRoot extends ForgetfulRoot {
  protected override childEntities(): readonly Entity<Identifier>[] {
    return this.children
  }
}

describe('Identifier', () => {
  it('compares by value and by concrete class', () => {
    expect(ThingId.of('a').equals(ThingId.of('a'))).toBe(true)
    expect(ThingId.of('a').equals(ThingId.of('b'))).toBe(false)

    // Same string, different meaning. They are not the same thing.
    expect(ThingId.of('a').equals(OtherId.of('a'))).toBe(false)
  })

  it('refuses a blank value', () => {
    expect(() => ThingId.of('   ')).toThrowError(/identifier is not blank/)
  })
})

describe('Entity', () => {
  it('is equal by identity, not by attributes', () => {
    const one = new Child(ThingId.of('same'))
    const two = new Child(ThingId.of('same'))

    // Different objects, different histories — same entity.
    one.poke()
    expect(one.equals(two)).toBe(true)
    expect(one.hasPendingEvents).toBe(true)
    expect(two.hasPendingEvents).toBe(false)
  })

  it('drains its buffer, so an event is never published twice', () => {
    const child = new Child(ThingId.of('c'))
    child.poke()

    expect(child.pullDomainEvents()).toHaveLength(1)
    expect(child.pullDomainEvents()).toHaveLength(0)
  })
})

describe('AggregateRoot — how a child entity’s events escape', () => {
  it('publishes a child’s events when the root declares its children', () => {
    const root = new AttentiveRoot(ThingId.of('root'))
    const child = root.addChild(ThingId.of('child'))

    child.poke()

    const published = root.pullDomainEvents()
    expect(published.map((event) => event.name)).toEqual(['test.poked'])
  })

  it('SILENTLY LOSES a child’s events when the root forgets to declare them', () => {
    // This is the failure mode demonstrated in scenario 05. It is worth a test
    // precisely because nothing else catches it: no state is wrong, no
    // exception is thrown, the events simply never happen as far as the rest
    // of the system is concerned.
    const root = new ForgetfulRoot(ThingId.of('root'))
    const child = root.addChild(ThingId.of('child'))

    child.poke()

    expect(root.pullDomainEvents()).toHaveLength(0)
  })

  it('restores causal order between root and child events', () => {
    const root = new AttentiveRoot(ThingId.of('root'))
    const child = root.addChild(ThingId.of('child'))

    // Child speaks first, root second.
    child.poke()
    root.pokeSelf()

    const published = root.pullDomainEvents()

    expect(published.map((event) => (event as Poked).who)).toEqual(['child', 'root:root'])
    expect(published[0]!.sequence).toBeLessThan(published[1]!.sequence)
  })
})

describe('ValueObject', () => {
  interface PointProps {
    readonly x: number
    readonly y: number
  }

  class Point extends ValueObject<PointProps> {
    constructor(x: number, y: number) {
      super({ x, y })
    }
  }

  class Vector extends ValueObject<PointProps> {
    constructor(x: number, y: number) {
      super({ x, y })
    }
  }

  it('is equal by structure', () => {
    expect(new Point(1, 2).equals(new Point(1, 2))).toBe(true)
    expect(new Point(1, 2).equals(new Point(2, 1))).toBe(false)
  })

  it('is not equal to a different type with the same shape', () => {
    expect(new Point(1, 2).equals(new Vector(1, 2) as unknown as Point)).toBe(false)
  })

  it('is immutable', () => {
    const point = new Point(1, 2) as unknown as { props: { x: number } }
    expect(() => {
      point.props.x = 99
    }).toThrow()
  })
})
