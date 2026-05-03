import assert from "node:assert/strict";
import test from "node:test";
import { semanticColorNames, surfaceRadiusPx, workspacePalette } from "./design-tokens";

test("workspace palette avoids the old beige-heavy theme", () => {
  assert.equal(workspacePalette.background, "#f6f8fb");
  assert.equal(workspacePalette.surface, "#ffffff");
  assert.equal(workspacePalette.primary, "#0f766e");
});

test("surface radius follows the approved operational console scale", () => {
  assert.equal(surfaceRadiusPx.panel, 8);
  assert.equal(surfaceRadiusPx.control, 7);
  assert.equal(surfaceRadiusPx.badge, 999);
});

test("semantic statuses include text-friendly color names", () => {
  assert.deepEqual(semanticColorNames, ["success", "warning", "danger", "info"]);
});
