import assert from "node:assert/strict";
import { test } from "node:test";
import { formatLog, logger } from "../src/logger.js";

test("formatLog serializes level, message and metadata", () => {
  const output = formatLog("info", "hello", { foo: "bar" });
  const parsed = JSON.parse(output);
  assert.equal(parsed.level, "info");
  assert.equal(parsed.msg, "hello");
  assert.equal(parsed.foo, "bar");
  assert.ok(parsed.time, "timestamp should be present");
});

test("logger writes JSON string with message and metadata", async () => {
  const messages: string[] = [];
  const original = console.log;
  console.log = (msg?: unknown) => {
    if (typeof msg === "string") messages.push(msg);
    // @ts-expect-error ignore
    return undefined;
  };

  logger.info("ping", { count: 1 });
  console.log = original;

  assert.equal(messages.length, 1);
  const payload = JSON.parse(messages[0]);
  assert.equal(payload.msg, "ping");
  assert.equal(payload.count, 1);
  assert.equal(payload.level, "info");
});
