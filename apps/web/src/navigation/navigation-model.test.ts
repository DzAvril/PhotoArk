import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  getLegacyRedirectTarget,
  getPageMeta,
  getSyncPageMode,
  primaryNavItems,
  settingsNavItems,
  syncTabs
} from "./navigation-model";
import { SettingsLayoutPage } from "../pages/settings-layout-page";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test("primary navigation uses the approved workflow IA", () => {
  assert.deepEqual(
    primaryNavItems.map((item) => [item.to, item.label]),
    [
      ["/", "概览"],
      ["/media", "媒体库"],
      ["/sync", "同步"],
      ["/records", "记录"],
      ["/settings", "配置"]
    ]
  );
});

test("sync owns diff, jobs, and running subviews", () => {
  assert.deepEqual(
    syncTabs.map((item) => [item.value, item.label]),
    [
      ["diff", "差异检查"],
      ["jobs", "同步任务"],
      ["running", "执行中"]
    ]
  );
});

test("sync page query selection honors jobs redirects", () => {
  assert.equal(getSyncPageMode("?tab=jobs"), "jobs");
  assert.equal(getSyncPageMode("?tab=diff"), "diff");
  assert.equal(getSyncPageMode("?tab=running"), "running");
  assert.equal(getSyncPageMode(""), "diff");
});

test("settings no longer contains jobs", () => {
  assert.deepEqual(
    settingsNavItems.map((item) => item.to),
    ["/settings", "/settings/storages", "/settings/advanced"]
  );
});

test("settings layout does not expose jobs navigation", () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      { initialEntries: ["/settings"] },
      React.createElement(
        Routes,
        null,
        React.createElement(
          Route,
          { path: "/settings/*", element: React.createElement(SettingsLayoutPage) },
          React.createElement(Route, { index: true, element: React.createElement("div", null, "settings") })
        )
      )
    )
  );

  assert.match(markup, /通知/);
  assert.match(markup, /存储/);
  assert.match(markup, /高级/);
  assert.doesNotMatch(markup, /任务/);
  assert.doesNotMatch(markup, /\/settings\/jobs/);
});

test("legacy paths redirect to current workflows", () => {
  assert.equal(getLegacyRedirectTarget("/diff"), "/sync");
  assert.equal(getLegacyRedirectTarget("/jobs"), "/sync?tab=jobs");
  assert.equal(getLegacyRedirectTarget("/settings/jobs"), "/sync?tab=jobs");
  assert.equal(getLegacyRedirectTarget("/storages"), "/settings/storages");
  assert.equal(getLegacyRedirectTarget("/unknown"), null);
});

test("page metadata reflects renamed sections", () => {
  assert.equal(getPageMeta("/").title, "概览");
  assert.equal(getPageMeta("/media").title, "媒体库");
  assert.equal(getPageMeta("/sync").title, "同步");
  assert.equal(getPageMeta("/settings/storages").title, "存储配置");
});
