import type { MemberId, TitleId } from "@local/shared-kernel";

import type { Library } from "./lib/library.js";

/**
 * The fixture used by most scenarios and by the integration tests: one title,
 * three copies, three members.
 *
 * It lives in this package rather than in either caller because there is one of
 * it. Two copies of a fixture drift, and then a scenario and a test that look
 * like they exercise the same library quietly do not.
 *
 * Note the `log.clear()` at the end. Setting up the fixture raises perfectly
 * real events — a registration, three acquisitions, three enrolments — which are
 * noise in a transcript about borrowing. Clearing the log draws the line between
 * "arranging the world" and "the thing this scenario is about".
 */
export async function seedLibrary(library: Library): Promise<{
  dune: TitleId;
  alice: MemberId;
  bruno: MemberId;
  chloe: MemberId;
}> {
  const dune = await library.registerTitle.execute({
    titleId: "TITLE-DUNE",
    isbn: "9780441013593",
    heading: "Dune",
    author: "Frank Herbert",
    publishedYear: 1965,
  });

  for (const barcode of ["LIB-000101", "LIB-000102", "LIB-000103"]) {
    await library.acquireCopy.execute({ titleId: dune.value, barcode });
  }

  const alice = await library.membershipDesk.enrol({
    memberId: "CARD-0001",
    name: "Alice",
    tier: "Adult",
  });
  const bruno = await library.membershipDesk.enrol({
    memberId: "CARD-0002",
    name: "Bruno",
    tier: "Adult",
  });
  const chloe = await library.membershipDesk.enrol({
    memberId: "CARD-0003",
    name: "Chloé",
    tier: "Child",
  });

  library.log.clear();

  return { dune, alice, bruno, chloe };
}
