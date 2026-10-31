import "server-only";

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const randomToken = (): string => randomBytes(32).toString("base64url");
export const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");
export const hmac256 = (secret: string, value: string): string => createHmac("sha256", secret).update(value).digest("hex");

export function constantTimeHashMatch(value: string, expectedHex: string): boolean {
  const actual = Buffer.from(sha256(value), "hex");
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createTokenCipher(base64Key: string): { encrypt(value: string): string; decrypt(value: string): string } {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) throw new Error("Auth encryption key must contain exactly 32 bytes");
  return {
    encrypt(value) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
      return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
    },
    decrypt(value) {
      const [version, iv, tag, encrypted] = value.split(".");
      if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Invalid encrypted token");
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
    },
  };
}
