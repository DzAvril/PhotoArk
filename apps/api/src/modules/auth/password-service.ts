import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

type PasswordHashResult = {
  saltHex: string;
  hashHex: string;
};

const SCRYPT_KEY_LEN = 64;

export class PasswordService {
  hashPassword(password: string, saltHex?: string): PasswordHashResult {
    const nextSaltHex = saltHex ?? randomBytes(16).toString("hex");
    const hashHex = scryptSync(password, nextSaltHex, SCRYPT_KEY_LEN).toString("hex");
    return { saltHex: nextSaltHex, hashHex };
  }

  verifyPassword(password: string, saltHex: string, expectedHashHex: string): boolean {
    try {
      const actualHash = scryptSync(password, saltHex, SCRYPT_KEY_LEN);
      const expectedHash = Buffer.from(expectedHashHex, "hex");
      if (actualHash.length !== expectedHash.length) {
        return false;
      }
      return timingSafeEqual(actualHash, expectedHash);
    } catch {
      return false;
    }
  }
}
