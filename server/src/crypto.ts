import crypto from "node:crypto";

export function normalizeUsn(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, "").toUpperCase() : "";
}

export function isUsnValid(value: string) {
  return /^[A-Z0-9][A-Z0-9._/-]{2,31}$/.test(value);
}

export function createQrToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashQrToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function tokenIdentifier(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 16).toUpperCase();
}

export function encryptToken(token: string, keyBase64: string) {
  if (!keyBase64) throw new Error("QR_ENCRYPTION_KEY is not configured");
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) throw new Error("QR_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

export function decryptToken(ciphertext: string, keyBase64: string) {
  if (!keyBase64) throw new Error("QR_ENCRYPTION_KEY is not configured");
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) throw new Error("QR_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  const input = Buffer.from(ciphertext, "base64");
  const iv = input.subarray(0, 12);
  const authTag = input.subarray(12, 28);
  const encrypted = input.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
