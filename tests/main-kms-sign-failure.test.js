import assert from "node:assert/strict";
import { mock } from "node:test";
import { KMSClient } from "@aws-sdk/client-kms";
import { DEFAULT_ENV, test } from "./main.js";

const send = mock.method(KMSClient.prototype, "send", async () => {
  throw new Error("KMS access denied");
});
const originalError = console.error;
console.error = (error) => originalError(error.message);
await test(() => {}, {
  ...DEFAULT_ENV,
  "INPUT_PRIVATE-KEY": "",
  "INPUT_KMS-KEY-ID": "alias/github-app/test",
});
assert.equal(process.exitCode, 1);
assert.equal(send.mock.callCount(), 1);
process.exitCode = 0;
mock.restoreAll();
