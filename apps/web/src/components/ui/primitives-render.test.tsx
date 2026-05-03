import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Search } from "lucide-react";
import { Button } from "./button";
import { IconButton } from "./icon-button";
import { PageHeader } from "./page-header";
import { SegmentedControl } from "./segmented-control";
import { Field } from "./field";
import { StateBlock } from "./state-block";

test("Button renders loading state without dropping label", () => {
  const html = renderToStaticMarkup(<Button busy>保存</Button>);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /保存/);
});

test("IconButton requires and renders aria label", () => {
  const html = renderToStaticMarkup(<IconButton ariaLabel="搜索" icon={<Search />} />);
  assert.match(html, /aria-label="搜索"/);
});

test("PageHeader renders title, description, actions, and chips", () => {
  const html = renderToStaticMarkup(
    <PageHeader
      eyebrow="PhotoArk"
      title="概览"
      description="容量、媒体分布、趋势、风险与最近活动"
      chips={<span className="mp-chip">健康</span>}
      actions={<Button>刷新</Button>}
    />
  );
  assert.match(html, /概览/);
  assert.match(html, /容量、媒体分布/);
  assert.match(html, /刷新/);
});

test("SegmentedControl marks the selected item", () => {
  const html = renderToStaticMarkup(
    <SegmentedControl
      ariaLabel="同步视图"
      value="diff"
      items={[
        { value: "diff", label: "差异检查" },
        { value: "jobs", label: "同步任务" }
      ]}
      onChange={() => undefined}
    />
  );
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /差异检查/);
});

test("Field connects label and help text", () => {
  const html = renderToStaticMarkup(
    <Field id="job-name" label="任务名称" help="用于记录和筛选">
      <input id="job-name" />
    </Field>
  );
  assert.match(html, /for="job-name"/);
  assert.match(html, /用于记录和筛选/);
});

test("StateBlock renders an action when supplied", () => {
  const html = renderToStaticMarkup(<StateBlock title="暂无数据" description="创建任务后会显示记录" action={<Button>新建任务</Button>} />);
  assert.match(html, /暂无数据/);
  assert.match(html, /新建任务/);
});
