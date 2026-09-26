import test from "node:test";
import assert from "node:assert/strict";
import {
  assertAvailabilityDoesNotOverlap,
  type Availability,
} from "../src/lib/domain";

const original: Availability = {
  id: "one",
  userId: "alice",
  start: "2026-10-04T15:00:00Z",
  end: "2026-10-04T20:00:00Z",
  mode: "online",
  status: "pending",
};
const slot = (start: string, end: string) => ({
  start: `2026-10-04T${start}:00Z`,
  end: `2026-10-04T${end}:00Z`,
});
test("reject duplicate, contained, enclosing, and partial overlapping windows", () => {
  for (const range of [
    slot("15:00", "20:00"),
    slot("16:00", "17:00"),
    slot("14:00", "21:00"),
    slot("14:00", "16:00"),
    slot("19:00", "21:00"),
  ])
    assert.throws(
      () => assertAvailabilityDoesNotOverlap([original], "alice", range),
      { code: "availability_overlap", status: 409 },
    );
});
test("adjacent times, different users, and unchanged self edits are allowed", () => {
  for (const range of [slot("14:00", "15:00"), slot("20:00", "21:00")])
    assert.doesNotThrow(() =>
      assertAvailabilityDoesNotOverlap([original], "alice", range),
    );
  assert.doesNotThrow(() =>
    assertAvailabilityDoesNotOverlap([original], "bob", original),
  );
  assert.doesNotThrow(() =>
    assertAvailabilityDoesNotOverlap(
      [original],
      "alice",
      original,
      original.id,
    ),
  );
});
test("paused and filled windows remain reserved; cancelled and expired ones do not", () => {
  for (const status of ["pending", "paused", "filled"] as const)
    assert.throws(
      () =>
        assertAvailabilityDoesNotOverlap(
          [{ ...original, status }],
          "alice",
          original,
        ),
      { code: "availability_overlap" },
    );
  for (const status of ["cancelled", "expired"] as const)
    assert.doesNotThrow(() =>
      assertAvailabilityDoesNotOverlap(
        [{ ...original, status }],
        "alice",
        original,
      ),
    );
});
test("overlap is based on instants across timezone offsets", () => {
  assert.throws(
    () =>
      assertAvailabilityDoesNotOverlap([original], "alice", {
        start: "2026-10-04T08:00:00-07:00",
        end: "2026-10-04T09:00:00-07:00",
      }),
    { code: "availability_overlap" },
  );
});
