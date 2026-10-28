import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matches, parseCron, slotFor } from "../src/cron.ts";

describe("parseCron", () => {
  it("expands wildcards, lists, ranges and steps", () => {
    const fields = parseCron("*/15 9-17 1,15 * 1-5");
    assert.deepEqual(fields.minute, [0, 15, 30, 45]);
    assert.deepEqual(fields.hour, [9, 10, 11, 12, 13, 14, 15, 16, 17]);
    assert.deepEqual(fields.dayOfMonth, [1, 15]);
    assert.equal(fields.month.length, 12);
    assert.deepEqual(fields.dayOfWeek, [1, 2, 3, 4, 5]);
  });

  it("rejects anything that is not five fields", () => {
    assert.throws(() => parseCron("0 3 * *"), /has 4 fields, expected 5/);
    assert.throws(() => parseCron("0 0 3 * * *"), /has 6 fields/);
  });

  it("rejects values outside the field's range", () => {
    assert.throws(() => parseCron("60 * * * *"), /outside 0-59/);
    assert.throws(() => parseCron("0 24 * * *"), /outside 0-23/);
    assert.throws(() => parseCron("0 0 32 * *"), /outside 1-31/);
  });
});

describe("matches", () => {
  it("fires on the scheduled minute only", () => {
    const fields = parseCron("0 3 * * *");
    assert.equal(matches(fields, new Date("2026-10-27T03:00:00Z")), true);
    assert.equal(matches(fields, new Date("2026-10-27T03:01:00Z")), false);
  });

  it("or-s the day fields when both are restricted, like POSIX cron", () => {
    const fields = parseCron("0 0 1 * 1");
    assert.equal(matches(fields, new Date("2026-06-01T00:00:00Z")), true); // Monday the 1st
    assert.equal(matches(fields, new Date("2026-06-08T00:00:00Z")), true); // Monday
    assert.equal(matches(fields, new Date("2026-06-02T00:00:00Z")), false); // Tuesday the 2nd
  });

  it("and-s when one day field is a wildcard", () => {
    const fields = parseCron("0 0 * * 1");
    assert.equal(matches(fields, new Date("2026-06-03T00:00:00Z")), false);
    assert.equal(matches(fields, new Date("2026-06-04T00:00:00Z")), false);
  });
});

describe("slotFor", () => {
  it("truncates to the minute so one slot exists per occurrence", () => {
    assert.equal(
      slotFor(new Date("2026-10-27T03:00:47.812Z")),
      "2026-10-27T03:00:00.000Z",
    );
    assert.equal(
      slotFor(new Date("2026-10-27T03:00:12.004Z")),
      slotFor(new Date("2026-10-27T03:00:59.999Z")),
    );
  });
});
