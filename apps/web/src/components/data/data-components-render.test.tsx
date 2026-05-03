import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DataTable } from "./data-table";
import { MetricTile } from "./metric-tile";
import { MobileList } from "./mobile-list";
import { ProgressBar } from "./progress-bar";
import { StatusBadge } from "./status-badge";

test("StatusBadge includes visible text for color-coded state", () => {
  const html = renderToStaticMarkup(<StatusBadge tone="warning">待处理</StatusBadge>);
  assert.match(html, /待处理/);
  assert.match(html, /mp-chip-warning/);
});

test("MetricTile renders label, value, and description", () => {
  const html = renderToStaticMarkup(<MetricTile label="媒体文件" value="12,408" description="图片与视频总数" />);
  assert.match(html, /媒体文件/);
  assert.match(html, /12,408/);
  assert.match(html, /图片与视频总数/);
});

test("ProgressBar clamps width while preserving accessible label", () => {
  const html = renderToStaticMarkup(<ProgressBar value={128} label="容量使用率" />);
  assert.match(html, /aria-label="容量使用率"/);
  assert.match(html, /width:100%/);
});

test("MobileList renders each item through the supplied renderer", () => {
  const html = renderToStaticMarkup(
    <MobileList
      items={[{ id: "one", name: "NAS" }]}
      getKey={(item) => item.id}
      renderItem={(item) => <span>{item.name}</span>}
    />
  );
  assert.match(html, /NAS/);
});

test("DataTable renders headers and item cells", () => {
  const html = renderToStaticMarkup(
    <DataTable
      items={[{ id: "one", name: "NAS" }]}
      getKey={(item) => item.id}
      columns={[
        {
          key: "name",
          header: "名称",
          render: (item) => item.name,
          headerProps: { "aria-sort": "ascending" }
        }
      ]}
    />
  );
  assert.match(html, /mp-data-table/);
  assert.match(html, /aria-sort="ascending"/);
  assert.match(html, /名称/);
  assert.match(html, /NAS/);
});
