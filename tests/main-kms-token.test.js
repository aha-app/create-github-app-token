import assert from "node:assert/strict";
import { mock } from "node:test";
import { Readable } from "node:stream";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { DEFAULT_ENV, test } from "./main.js";

mock.method(Date, "now", () => 1_700_000_000_000);
// Exercise the real SDK serialization and signing with a mocked HTTP transport.
const handle = mock.method(NodeHttpHandler.prototype, "handle", async (request) => {
  assert.equal(request.hostname, "kms.us-east-1.amazonaws.com");
  assert.equal(request.headers["x-amz-target"], "TrentService.Sign");
  assert.match(request.headers.authorization, /^AWS4-HMAC-SHA256 /);
  const input = JSON.parse(new TextDecoder().decode(request.body));
  assert.equal(input.KeyId, "alias/github-app/test");
  assert.equal(input.MessageType, "RAW");
  assert.equal(input.SigningAlgorithm, "RSASSA_PKCS1_V1_5_SHA_256");
  const [header, payload] = Buffer.from(input.Message, "base64").toString().split(".");
  assert.equal(JSON.parse(Buffer.from(header, "base64url")).alg, "RS256");
  assert.equal(JSON.parse(Buffer.from(payload, "base64url")).iss, DEFAULT_ENV["INPUT_CLIENT-ID"]);
  return {
    response: {
      statusCode: 200,
      headers: { "content-type": "application/x-amz-json-1.1" },
      body: Readable.from([JSON.stringify({ Signature: Buffer.from("test-signature").toString("base64") })]),
    },
  };
});

await test(() => {}, {
  ...DEFAULT_ENV,
  "INPUT_PRIVATE-KEY": "",
  "INPUT_KMS-KEY-ID": "alias/github-app/test",
  "INPUT_PERMISSION-CONTENTS": "write",
  "INPUT_PERMISSION-PULL-REQUESTS": "write",
  AWS_REGION: "us-east-1",
  AWS_ACCESS_KEY_ID: "test-access-key",
  AWS_SECRET_ACCESS_KEY: "test-secret-key",
  AWS_SESSION_TOKEN: "test-session-token",
});
assert.equal(handle.mock.callCount(), 2);
mock.restoreAll();
