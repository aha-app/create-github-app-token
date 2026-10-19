import assert from "node:assert/strict";
import { generateKeyPairSync, sign, verify } from "node:crypto";
import { mock } from "node:test";
import { KMSClient, SignCommand } from "@aws-sdk/client-kms";
import { createKmsJwt } from "../lib/create-kms-jwt.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const keyId = "arn:aws:kms:us-east-1:123456789012:key/test-key";
const masked = [];
mock.method(Date, "now", () => 1_700_000_000_000);
const send = mock.method(KMSClient.prototype, "send", async (command) => {
  assert.ok(command instanceof SignCommand);
  assert.equal(command.input.KeyId, keyId);
  assert.equal(command.input.MessageType, "RAW");
  assert.equal(command.input.SigningAlgorithm, "RSASSA_PKCS1_V1_5_SHA_256");
  assert.ok(command.input.Message instanceof Uint8Array);
  return { Signature: sign("RSA-SHA256", command.input.Message, privateKey) };
});
const createJwt = createKmsJwt(keyId, { setSecret: (jwt) => masked.push(jwt) });

const result = await createJwt("Iv1.test");
const [header, payload, signature] = result.jwt.split(".");
assert.deepEqual(JSON.parse(Buffer.from(header, "base64url")), { alg: "RS256", typ: "JWT" });
assert.deepEqual(JSON.parse(Buffer.from(payload, "base64url")), {
  iat: 1_699_999_970,
  exp: 1_700_000_570,
  iss: "Iv1.test",
});
assert.ok(verify("RSA-SHA256", Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, "base64url")));
assert.match(result.jwt, /^[\w-]+\.[\w-]+\.[\w-]+$/);
assert.equal(result.expiresAt, new Date(1_700_000_570_000).toISOString());
assert.deepEqual(masked, [result.jwt]);

// Octokit retries authentication with an offset when GitHub reports clock skew.
const adjusted = await createJwt(123456, -120);
assert.deepEqual(JSON.parse(Buffer.from(adjusted.jwt.split(".")[1], "base64url")), {
  iat: 1_699_999_850,
  exp: 1_700_000_450,
  iss: 123456,
});
assert.equal(adjusted.expiresAt, new Date(1_700_000_450_000).toISOString());

const denied = new Error("AccessDeniedException");
send.mock.mockImplementation(async () => { throw denied; });
await assert.rejects(createJwt("Iv1.test"), (error) => error === denied);
send.mock.mockImplementation(async () => ({}));
await assert.rejects(createJwt("Iv1.test"), /empty signature/);
send.mock.mockImplementation(async () => ({ Signature: new Uint8Array() }));
await assert.rejects(createJwt("Iv1.test"), /empty signature/);
assert.equal(masked.length, 2);
mock.restoreAll();
