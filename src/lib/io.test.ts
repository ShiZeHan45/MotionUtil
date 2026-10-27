import assert from "node:assert/strict";
import test from "node:test";
import { safeJson } from "./io";

test("safeJson 去掉完整 JSON 后多余的闭合括号", () => {
  assert.deepEqual(safeJson('{"a":[{"b":1}]}]}'), { a: [{ b: 1 }] });
  assert.deepEqual(safeJson('```json\n{"a":1}\n```'), { a: 1 });
});

test("safeJson 遇到其他尾部内容仍然报错", () => {
  assert.throws(() => safeJson('{"a":1} 多余文字'), SyntaxError);
  assert.throws(() => safeJson('{"a":1}{"b":2}'), SyntaxError);
});
