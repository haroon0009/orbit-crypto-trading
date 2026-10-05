import assert from "node:assert/strict";
import test from "node:test";

import { jobProgressPercent, jobStatusLabel } from "../web/src/job-status.js";

test("normalizes BullMQ progress for display", () => {
  assert.equal(jobProgressPercent({ state: "active", progress: 25 }), 25);
  assert.equal(jobProgressPercent({ state: "completed", progress: 90 }), 100);
  assert.equal(jobProgressPercent({ state: "active", progress: 125 }), 100);
  assert.equal(jobProgressPercent({ state: "waiting", progress: {} }), 0);
});

test("uses readable queue state labels", () => {
  assert.equal(jobStatusLabel("waiting"), "Queued");
  assert.equal(jobStatusLabel("active"), "Running");
  assert.equal(jobStatusLabel("completed"), "Completed");
  assert.equal(jobStatusLabel("failed"), "Failed");
});
