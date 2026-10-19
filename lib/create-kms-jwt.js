// @ts-check
import { KMSClient, SignCommand } from "@aws-sdk/client-kms";

/**
 * @param {string} keyId
 * @param {Pick<typeof import("@actions/core"), "setSecret">} core
 */
export function createKmsJwt(keyId, core) {
  const client = new KMSClient({});

  /**
   * @param {string | number} clientId
   * @param {number} [timeDifference]
   */
  return async (clientId, timeDifference = 0) => {
    // Match Octokit's clock-skew adjustment and ten-minute JWT lifetime.
    const iat = Math.floor(Date.now() / 1000) + timeDifference - 30;
    const exp = iat + 600;
    const header = Buffer.from(
      JSON.stringify({ alg: "RS256", typ: "JWT" })
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ iat, exp, iss: clientId })
    ).toString("base64url");
    const message = `${header}.${payload}`;

    const { Signature } = await client.send(
      new SignCommand({
        KeyId: keyId,
        Message: Buffer.from(message),
        MessageType: "RAW",
        SigningAlgorithm: "RSASSA_PKCS1_V1_5_SHA_256",
      })
    );
    if (!Signature?.length) {
      throw new Error("AWS KMS returned an empty signature.");
    }

    const jwt = `${message}.${Buffer.from(Signature).toString("base64url")}`;
    // Mask before Octokit can include the JWT in request errors or diagnostics.
    core.setSecret(jwt);
    return { jwt, expiresAt: new Date(exp * 1000).toISOString() };
  };
}
