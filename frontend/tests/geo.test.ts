import assert from "node:assert/strict";
import test from "node:test";

import { MAX_ANALYSIS_AREA_M2 } from "../lib/config.ts";
import { getAreaValidationMessage } from "../lib/geo.ts";

test("analysis area safe limit is ten square kilometers", () => {
  assert.equal(MAX_ANALYSIS_AREA_M2, 10_000_000);
  assert.equal(getAreaValidationMessage(10_000_000), null);
  assert.match(getAreaValidationMessage(10_000_001) ?? "", /10 km²/);
});
