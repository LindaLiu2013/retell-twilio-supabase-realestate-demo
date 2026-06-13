import assert from "node:assert/strict";
import test from "node:test";
import { env } from "../src/config.js";

test("treats blank and placeholder environment values as missing", () => {
  process.env.EMPTY_TEST_VALUE = "";
  process.env.TODO_TEST_VALUE = "TODO_twilio_auth_token";
  process.env.EXAMPLE_TEST_VALUE = "https://your-project.supabase.co";
  process.env.REAL_TEST_VALUE = "real-value";

  assert.equal(env("EMPTY_TEST_VALUE", "fallback"), "fallback");
  assert.equal(env("TODO_TEST_VALUE", "fallback"), "fallback");
  assert.equal(env("EXAMPLE_TEST_VALUE", "fallback"), "fallback");
  assert.equal(env("REAL_TEST_VALUE", "fallback"), "real-value");
});
