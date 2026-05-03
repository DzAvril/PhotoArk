import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LoginPage } from "./login-page";

test("login page keeps product identity and form entry", () => {
  const html = renderToStaticMarkup(<LoginPage onAuthenticated={() => undefined} />);
  assert.match(html, /PhotoArk/);
  assert.match(html, /用户名/);
  assert.match(html, /密码/);
});
