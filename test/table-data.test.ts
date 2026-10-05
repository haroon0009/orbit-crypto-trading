import assert from "node:assert/strict";
import test from "node:test";

import { visibleRowIndexes } from "../web/src/table-data.js";

const rows = [
  ["EMA pullback", "BTCUSDT", "12"],
  ["Donchian breakout", "ETHUSDT", "8"],
  ["EMA pullback", "ETHUSDT", "20"],
];

test("data table combines search and exact column filtering", () => {
  assert.deepEqual(
    visibleRowIndexes(rows, {
      query: "eth",
      filterColumn: 0,
      filterValue: "EMA pullback",
    }),
    [2],
  );
});

test("data table sorts numeric cells in both directions", () => {
  assert.deepEqual(
    visibleRowIndexes(rows, { sortColumn: 2, sortDirection: "asc" }),
    [1, 0, 2],
  );
  assert.deepEqual(
    visibleRowIndexes(rows, { sortColumn: 2, sortDirection: "desc" }),
    [2, 0, 1],
  );
});
