import assert from "node:assert/strict";
import test from "node:test";

import { MAX_ANALYSIS_AREA_M2 } from "../lib/config.ts";
import { getAreaValidationMessage } from "../lib/geo.ts";

test("analysis area safe limit is five square kilometers", () => {
  assert.equal(MAX_ANALYSIS_AREA_M2, 5_000_000);
  assert.equal(getAreaValidationMessage(5_000_000), null);
  assert.match(getAreaValidationMessage(5_000_001) ?? "", /5 km²/);
});
