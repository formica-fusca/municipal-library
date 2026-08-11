import { FixedClock } from "@local/ddd-core";
import { EventLog, InMemoryEventBus, UnitOfWork } from "@local/event-bus";

import { InMemoryTitleRepository, RegisterTitle } from "@local/library-catalog";
import {
  AcquireCopy,
  InMemoryBookStockRepository,
  ShelfOperations,
} from "@local/library-inventory";
import {
  InMemoryMemberRepository,
  MembershipDesk,
} from "@local/library-membership";
import {
  BorrowBook,
  HoldDesk,
  InMemoryHoldQueueRepository,
  InMemoryLoanRepository,
  OverdueSweep,
  ReturnBook,
  StrictFifoAllocation,
} from "@local/library-lending";
import {
  InMemoryStockItemRepository,
  ShopCounter,
} from "@local/bookshop-inventory";

import {
  BorrowerDirectoryAdapter,
  SequentialIds,
  ShelfAdapter,
} from "./adapters.js";
import { subscribe } from "./subscriptions.js";
import type { Library, LibraryOptions } from "./library.js";

/**
 * Assembles one library: repositories, then the application services that use
 * them, then the two kinds of connection between contexts.
 *
 * Read top to bottom, this function *is* the architecture. Nothing crosses a
 * context boundary except through one of two things, and each has its own
 * module so that neither can be added quietly:
 *
 * 1. **An adapter** implementing a port the consuming context declared —
 *    `adapters.ts`.
 * 2. **A subscription** on the event bus — `subscriptions.ts`.
 *
 * Everything else here is instantiation, in dependency order.
 */
export function buildLibrary(options: LibraryOptions = {}): Library {
  const clock = new FixedClock(
    options.startAt ?? new Date("2026-03-02T09:00:00Z"),
  );
  const bus = new InMemoryEventBus();
  const log = new EventLog().attachTo(bus);
  const unitOfWork = new UnitOfWork(bus);
  const ids = new SequentialIds();
  const notifications: string[] = [];

  // ── Repositories ──────────────────────────────────────────────────────────
  const titles = new InMemoryTitleRepository();
  const stocks = new InMemoryBookStockRepository();
  const members = new InMemoryMemberRepository();
  const loans = new InMemoryLoanRepository();
  const queues = new InMemoryHoldQueueRepository();
  const shopStock = new InMemoryStockItemRepository();

  // ── Application services, per context ─────────────────────────────────────
  const registerTitle = new RegisterTitle({ titles, unitOfWork, clock });
  const acquireCopy = new AcquireCopy({ stocks, unitOfWork, clock });
  const shelf = new ShelfOperations({ stocks, unitOfWork, clock });
  const membershipDesk = new MembershipDesk({ members, unitOfWork, clock });
  const shop = new ShopCounter({ stock: shopStock, unitOfWork, clock });

  // ── Adapters — Lending's ports, answered by other contexts ────────────────
  const shelfGateway = new ShelfAdapter(shelf);
  const borrowers = new BorrowerDirectoryAdapter(membershipDesk);

  const holdDesk = new HoldDesk({
    holds: queues,
    loans,
    shelf: shelfGateway,
    ids,
    unitOfWork,
    clock,
    allocationPolicy: options.allocationPolicy ?? new StrictFifoAllocation(),
  });

  const borrowBook = new BorrowBook({
    loans,
    holds: queues,
    borrowers,
    shelf: shelfGateway,
    ids,
    unitOfWork,
    clock,
  });

  const returnBook = new ReturnBook({
    loans,
    shelf: shelfGateway,
    unitOfWork,
    clock,
  });
  const overdueSweep = new OverdueSweep({ loans, unitOfWork, clock });

  // ── Subscriptions — every remaining cross-context link ────────────────────
  subscribe({ bus, membershipDesk, holdDesk, notifications });

  // An observer supplied by the caller, not part of the wiring: the scenarios
  // print each event, the playground appends a table row.
  if (options.onEvent !== undefined) {
    bus.onAny(options.onEvent);
  }

  return {
    clock,
    bus,
    log,
    notifications,
    titles,
    stocks,
    members,
    loans,
    queues,
    shopStock,
    registerTitle,
    acquireCopy,
    shelf,
    membershipDesk,
    borrowBook,
    returnBook,
    holdDesk,
    overdueSweep,
    shop,
  };
}
