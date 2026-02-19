import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, rename, stat, unlink } from "node:fs/promises";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
  type CipherGCM
} from "node:crypto";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const MAGIC = Buffer.from("PARK", "ascii");
const FORMAT_VERSION = 1;
const FORMAT_VERSION_STREAM = 2;
const KEY_ID_LENGTH = 8;
const HEADER_LENGTH = MAGIC.length + 1 + KEY_ID_LENGTH + IV_LENGTH + TAG_LENGTH;
const STREAM_HEADER_LENGTH = MAGIC.length + 1 + KEY_ID_LENGTH + IV_LENGTH;
const MIN_ENVELOPE_LENGTH = MAGIC.length + 1;
const LEGACY_PREFIX_LENGTH = IV_LENGTH + TAG_LENGTH;

type KeyEntry = {
  key: Buffer<ArrayBufferLike>;
  keyId: Buffer<ArrayBufferLike>;
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

function encryptHeaderV2(keyId: Buffer, iv: Buffer): Buffer {
  return Buffer.concat([MAGIC, Buffer.from([FORMAT_VERSION_STREAM]), keyId, iv]);
}

function isAuthFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("unable to authenticate data") ||
    message.includes("auth tag") ||
    message.includes("bad decrypt")
  );
}

function hasEnvelopeHeader(blob: Buffer): boolean {
  return blob.length >= MIN_ENVELOPE_LENGTH && blob.subarray(0, MAGIC.length).equals(MAGIC);
}

type EncryptedFileMeta = {
  iv: Buffer;
  tag: Buffer;
  startOffset: number;
  endOffset: number;
  candidates: KeyEntry[];
};

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

  private resolveCandidates(keyId?: Buffer): KeyEntry[] {
    if (!keyId) {
      return this.allKeys;
    }
    const preferred = this.allKeys.find((entry) => timingSafeEqual(entry.keyId, keyId));
    if (!preferred) {
      return this.allKeys;
    }
    return [preferred, ...this.allKeys.filter((entry) => entry !== preferred)];
  }

  decrypt(blob: Buffer): Buffer {
    if (hasEnvelopeHeader(blob)) {
      const version = blob.readUInt8(MAGIC.length);
      const keyIdStart = MAGIC.length + 1;
      const keyId = blob.subarray(keyIdStart, keyIdStart + KEY_ID_LENGTH);
      let iv: Buffer<ArrayBufferLike>;
      let tag: Buffer<ArrayBufferLike>;
      let content: Buffer<ArrayBufferLike>;

      if (version === FORMAT_VERSION) {
        if (blob.length < HEADER_LENGTH) {
          throw new Error("Encrypted payload is corrupted (header too short).");
        }
        iv = blob.subarray(keyIdStart + KEY_ID_LENGTH, keyIdStart + KEY_ID_LENGTH + IV_LENGTH);
        tag = blob.subarray(
          keyIdStart + KEY_ID_LENGTH + IV_LENGTH,
          keyIdStart + KEY_ID_LENGTH + IV_LENGTH + TAG_LENGTH
        );
        content = blob.subarray(HEADER_LENGTH);
      } else if (version === FORMAT_VERSION_STREAM) {
        if (blob.length < STREAM_HEADER_LENGTH + TAG_LENGTH) {
          throw new Error("Encrypted payload is corrupted (stream envelope too short).");
        }
        iv = blob.subarray(keyIdStart + KEY_ID_LENGTH, keyIdStart + KEY_ID_LENGTH + IV_LENGTH);
        const payloadEnd = blob.length - TAG_LENGTH;
        tag = blob.subarray(payloadEnd);
        content = blob.subarray(STREAM_HEADER_LENGTH, payloadEnd);
      } else {
        throw new Error(`Unsupported encrypted file format version: ${version}`);
      }

      const candidates = this.resolveCandidates(keyId);
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

  private createEnvelopeTransform(header: Buffer, cipher: CipherGCM): Transform {
    let headerPushed = false;
    const pushHeader = (stream: Transform) => {
      if (headerPushed) return;
      stream.push(header);
      headerPushed = true;
    };

    return new Transform({
      transform(chunk, _encoding, callback) {
        pushHeader(this);
        this.push(chunk);
        callback();
      },
      flush(callback) {
        pushHeader(this);
        this.push(cipher.getAuthTag());
        callback();
      }
    });
  }

  private createRangeReadStream(filePath: string, startOffset: number, endOffset: number): Readable {
    if (endOffset < startOffset) {
      return Readable.from([]);
    }
    return createReadStream(filePath, {
      start: startOffset,
      end: endOffset
    });
  }

  private async withAtomicWrite(outputPath: string, action: (tmpPath: string) => Promise<void>): Promise<void> {
    await mkdir(path.dirname(outputPath), { recursive: true });
    const tmpPath = `${outputPath}.tmp-${randomUUID()}`;
    try {
      await action(tmpPath);
      await rename(tmpPath, outputPath);
    } catch (error) {
      await unlink(tmpPath).catch(() => undefined);
      throw error;
    }
  }

  async encryptFile(sourcePath: string, destinationPath: string): Promise<void> {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", this.current.key, iv) as CipherGCM;
    const header = encryptHeaderV2(this.current.keyId, iv);
    const envelope = this.createEnvelopeTransform(header, cipher);

    await this.withAtomicWrite(destinationPath, async (tmpPath) => {
      await pipeline(createReadStream(sourcePath), cipher, envelope, createWriteStream(tmpPath));
    });
  }

  private async inspectEncryptedFile(filePath: string): Promise<EncryptedFileMeta> {
    const fileStat = await stat(filePath);
    const fileSize = fileStat.size;
    const readLen = Math.min(fileSize, HEADER_LENGTH);
    const fd = await open(filePath, "r");
    try {
      const headerBuffer = Buffer.alloc(readLen);
      const headerRead = await fd.read(headerBuffer, 0, readLen, 0);
      const header = headerBuffer.subarray(0, headerRead.bytesRead);

      if (hasEnvelopeHeader(header)) {
        const version = header.readUInt8(MAGIC.length);
        const keyIdStart = MAGIC.length + 1;
        const keyId = header.subarray(keyIdStart, keyIdStart + KEY_ID_LENGTH);
        const iv = header.subarray(keyIdStart + KEY_ID_LENGTH, keyIdStart + KEY_ID_LENGTH + IV_LENGTH);

        if (version === FORMAT_VERSION) {
          if (fileSize < HEADER_LENGTH) {
            throw new Error("Encrypted file is corrupted (header too short)");
          }
          const tag = header.subarray(
            keyIdStart + KEY_ID_LENGTH + IV_LENGTH,
            keyIdStart + KEY_ID_LENGTH + IV_LENGTH + TAG_LENGTH
          );
          return {
            iv,
            tag,
            startOffset: HEADER_LENGTH,
            endOffset: fileSize - 1,
            candidates: this.resolveCandidates(keyId)
          };
        }

        if (version === FORMAT_VERSION_STREAM) {
          if (fileSize < STREAM_HEADER_LENGTH + TAG_LENGTH) {
            throw new Error("Encrypted file is corrupted (stream envelope too short)");
          }
          const tagBuffer = Buffer.alloc(TAG_LENGTH);
          await fd.read(tagBuffer, 0, TAG_LENGTH, fileSize - TAG_LENGTH);
          return {
            iv,
            tag: tagBuffer,
            startOffset: STREAM_HEADER_LENGTH,
            endOffset: fileSize - TAG_LENGTH - 1,
            candidates: this.resolveCandidates(keyId)
          };
        }

        throw new Error(`Unsupported encrypted file format version: ${version}`);
      }

      if (fileSize < LEGACY_PREFIX_LENGTH) {
        throw new Error("Encrypted file is corrupted (legacy prefix too short)");
      }

      const iv = header.subarray(0, IV_LENGTH);
      const tag = header.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
      return {
        iv,
        tag,
        startOffset: LEGACY_PREFIX_LENGTH,
        endOffset: fileSize - 1,
        candidates: this.allKeys
      };
    } finally {
      await fd.close();
    }
  }

  private async runDecryptPipeline(
    sourcePath: string,
    destinationPath: string,
    meta: EncryptedFileMeta,
    candidate: KeyEntry
  ): Promise<void> {
    await this.withAtomicWrite(destinationPath, async (tmpPath) => {
      const decipher = createDecipheriv("aes-256-gcm", candidate.key, meta.iv);
      decipher.setAuthTag(meta.tag);
      await pipeline(
        this.createRangeReadStream(sourcePath, meta.startOffset, meta.endOffset),
        decipher,
        createWriteStream(tmpPath)
      );
    });
  }

  async decryptFile(sourcePath: string, destinationPath: string): Promise<void> {
    const meta = await this.inspectEncryptedFile(sourcePath);
    let lastError: unknown = null;
    for (const candidate of meta.candidates) {
      try {
        await this.runDecryptPipeline(sourcePath, destinationPath, meta, candidate);
        return;
      } catch (error) {
        lastError = error;
        if (!isAuthFailure(error)) {
          throw error;
        }
      }
    }
    throw new Error(`Failed to decrypt file: ${(lastError as Error | null)?.message ?? "no usable key matched"}`);
  }

  private async runReencryptPipeline(
    sourcePath: string,
    destinationPath: string,
    meta: EncryptedFileMeta,
    candidate: KeyEntry
  ): Promise<void> {
    await this.withAtomicWrite(destinationPath, async (tmpPath) => {
      const decipher = createDecipheriv("aes-256-gcm", candidate.key, meta.iv);
      decipher.setAuthTag(meta.tag);
      const nextIv = randomBytes(IV_LENGTH);
      const nextCipher = createCipheriv("aes-256-gcm", this.current.key, nextIv) as CipherGCM;
      const envelope = this.createEnvelopeTransform(encryptHeaderV2(this.current.keyId, nextIv), nextCipher);
      await pipeline(
        this.createRangeReadStream(sourcePath, meta.startOffset, meta.endOffset),
        decipher,
        nextCipher,
        envelope,
        createWriteStream(tmpPath)
      );
    });
  }

  async reencryptFile(sourcePath: string, destinationPath: string): Promise<void> {
    const meta = await this.inspectEncryptedFile(sourcePath);
    let lastError: unknown = null;
    for (const candidate of meta.candidates) {
      try {
        await this.runReencryptPipeline(sourcePath, destinationPath, meta, candidate);
        return;
      } catch (error) {
        lastError = error;
        if (!isAuthFailure(error)) {
          throw error;
        }
      }
    }
    throw new Error(`Failed to re-encrypt file: ${(lastError as Error | null)?.message ?? "no usable key matched"}`);
  }
}
