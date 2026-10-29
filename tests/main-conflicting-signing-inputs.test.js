import assert from "node:assert/strict";
import { DEFAULT_ENV } from "./main.js";

Object.assign(process.env, DEFAULT_ENV, { "INPUT_KMS-KEY-ID": "alias/github-app/test" });
const originalError = console.error;
console.error = (error) => originalError(error.message);
const { default: promise } = await import("../main.js");
await promise;
assert.equal(process.exitCode, 1);
process.exitCode = 0;
