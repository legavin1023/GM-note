import test from "node:test";
import assert from "node:assert/strict";
import { autoLinkParts } from "../src/services/autoLinks.mjs";

test("recognizes multiple web URLs and preserves all original text", () => {
  const text = "자료 https://example.com/a?x=1&y=2\nwww.example.org 그리고 http://example.net";
  const parts = autoLinkParts(text);
  assert.equal(parts.map((part) => part.text).join(""), text);
  assert.deepEqual(parts.filter((part) => part.href).map((part) => part.href), [
    "https://example.com/a?x=1&y=2",
    "https://www.example.org",
    "http://example.net",
  ]);
});

test("excludes sentence punctuation while keeping balanced URL parentheses", () => {
  const text = "(https://example.com/wiki/Dragon_(Age)). www.example.org!";
  const parts = autoLinkParts(text);
  assert.equal(parts.map((part) => part.text).join(""), text);
  assert.deepEqual(parts.filter((part) => part.href).map((part) => part.text), [
    "https://example.com/wiki/Dragon_(Age)",
    "www.example.org",
  ]);
});

test("keeps HTML and unsafe schemes as plain text and skips malformed URLs", () => {
  const text = '<script>alert(1)</script> javascript:alert(1) data:text/html,test https://';
  assert.deepEqual(autoLinkParts(text), [{ text }]);
  assert.deepEqual(autoLinkParts(""), []);
});

test("invalid URL before a valid URL does not lose text", () => {
  const text = "https://?bad 다음 https://example.com";
  const parts = autoLinkParts(text);
  assert.equal(parts.map((part) => part.text).join(""), text);
  assert.equal(parts.filter((part) => part.href).length, 1);
});
