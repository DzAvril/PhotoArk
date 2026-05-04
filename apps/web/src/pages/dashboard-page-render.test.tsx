import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { DashboardPage } from "./dashboard-page";

test("overview renders a single storage media distribution section", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>
  );

  const matches = html.match(/(?:存储媒体分布|媒体分布（按存储目录）)/g) ?? [];
  assert.equal(matches.length, 1);
});

test("source activity heatmap avoids fixed desktop width on narrow screens", () => {
  const source = readFileSync(new URL("./dashboard-page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /min-w-\[/);
  assert.doesNotMatch(source, /overflow-x-auto/);
});
