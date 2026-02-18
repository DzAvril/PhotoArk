import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const MAGIC = Buffer.from("PARK", "ascii");
const FORMAT_VERSION = 1;
const KEY_ID_LENGTH = 8;
const HEADER_LENGTH = MAGIC.length + 1 + KEY_ID_LENGTH + IV_LENGTH + TAG_LENGTH;
const LEGACY_PREFIX_LENGTH = IV_LENGTH + TAG_LENGTH;

type KeyEntry = {
  key: Buffer;
  keyId: Buffer;
};

function assertKeyLength(input: Buffer, label: string): Buffer {
  if (input.length !== KEY_LENGTH) {
    throw new Error(`${label} must be 32 bytes after base64 decoding.`);
  }
  return input;
}

function buildKeyId(key: Buffer): Buffer {
  return createHash("sha256").update(key).digest().subarray(0, KEY_ID_LENGTH);
}

function decryptGcm(key: Buffer, iv: Buffer, tag: Buffer, content: Buffer): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(content), decipher.final()]);
}

function hasEnvelopeHeader(blob: Buffer): boolean {
  return blob.length >= HEADER_LENGTH && blob.subarray(0, MAGIC.length).equals(MAGIC);
}

export class EncryptionService {
  private readonly current: KeyEntry;
  private readonly allKeys: KeyEntry[];

  constructor(currentKey: Buffer, legacyKeys: Buffer[] = []) {
    const normalizedCurrent = assertKeyLength(currentKey, "MASTER_KEY_BASE64");
    const keyByHex = new Map<string, Buffer>();
    keyByHex.set(normalizedCurrent.toString("hex"), normalizedCurrent);

    for (const key of legacyKeys) {
      const normalizedLegacy = assertKeyLength(key, "LEGACY_MASTER_KEYS_BASE64 item");
      const hex = normalizedLegacy.toString("hex");
      if (!keyByHex.has(hex)) {
        keyByHex.set(hex, normalizedLegacy);
      }
    }

    this.current = {
      key: normalizedCurrent,
      keyId: buildKeyId(normalizedCurrent)
    };
    this.allKeys = [...keyByHex.values()].map((key) => ({
      key,
      keyId: buildKeyId(key)
    }));
  }

  encrypt(plain: Buffer): Buffer {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", this.current.key, iv);
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([MAGIC, Buffer.from([FORMAT_VERSION]), this.current.keyId, iv, tag, encrypted]);
  }

  decrypt(blob: Buffer): Buffer {
    if (hasEnvelopeHeader(blob)) {
      const version = blob.readUInt8(MAGIC.length);
      if (version !== FORMAT_VERSION) {
        throw new Error(`Unsupported encrypted file format version: ${version}`);
      }
      if (blob.length < HEADER_LENGTH) {
        throw new Error("Encrypted payload is corrupted (header too short).");
      }

      const keyIdStart = MAGIC.length + 1;
      const keyId = blob.subarray(keyIdStart, keyIdStart + KEY_ID_LENGTH);
      const iv = blob.subarray(keyIdStart + KEY_ID_LENGTH, keyIdStart + KEY_ID_LENGTH + IV_LENGTH);
      const tag = blob.subarray(
        keyIdStart + KEY_ID_LENGTH + IV_LENGTH,
        keyIdStart + KEY_ID_LENGTH + IV_LENGTH + TAG_LENGTH
      );
      const content = blob.subarray(HEADER_LENGTH);

      const preferred = this.allKeys.find((entry) => timingSafeEqual(entry.keyId, keyId));
      const candidates = preferred
        ? [preferred, ...this.allKeys.filter((entry) => entry !== preferred)]
        : this.allKeys;

      for (const entry of candidates) {
        try {
          return decryptGcm(entry.key, iv, tag, content);
        } catch {
          // Try next key.
        }
      }
      throw new Error("Failed to decrypt file: no usable key matched or ciphertext is corrupted.");
    }

    if (blob.length < LEGACY_PREFIX_LENGTH) {
      throw new Error("Encrypted payload is corrupted (legacy prefix too short).");
    }

    const iv = blob.subarray(0, IV_LENGTH);
    const tag = blob.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const content = blob.subarray(LEGACY_PREFIX_LENGTH);

    for (const entry of this.allKeys) {
      try {
        return decryptGcm(entry.key, iv, tag, content);
      } catch {
        // Try next key.
      }
    }
    throw new Error("Failed to decrypt legacy file: no usable key matched or ciphertext is corrupted.");
  }
}
