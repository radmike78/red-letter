import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { bytesToUtf8, utf8ToBytes } from './base64';
import { randomBytes } from './random';

/**
 * The on-disk format for Red Letter's data file.
 *
 * Everything the user has written is encrypted at rest with XChaCha20-Poly1305
 * under a key held in the device Keychain / Android Keystore. The web version
 * had no meaningful confidentiality problem because a browser tab cannot reach
 * the filesystem; a native app's documents directory is a different matter, and
 * on a rooted or jailbroken device a plaintext file is simply readable.
 *
 * XChaCha20 is used rather than AES-GCM for its 192-bit nonce: nonces can be
 * drawn at random for every single write with no practical collision risk, so
 * there is no counter to persist and no way for a restore to reuse one.
 *
 * Layout: MAGIC (4) | VERSION (1) | NONCE (24) | CIPHERTEXT+TAG
 */

const MAGIC = new Uint8Array([0x52, 0x4c, 0x45, 0x4e]); // "RLEN"
const VERSION = 1;
const NONCE_BYTES = 24;
export const KEY_BYTES = 32;
const HEADER_BYTES = MAGIC.length + 1 + NONCE_BYTES;

export class EnvelopeError extends Error {
  constructor(
    message: string,
    readonly reason: 'format' | 'version' | 'authentication' | 'json',
  ) {
    super(message);
    this.name = 'EnvelopeError';
  }
}

export function newDataKey(): Uint8Array {
  return randomBytes(KEY_BYTES);
}

/** Serialises and encrypts. A fresh random nonce is used for every write. */
export function seal(value: unknown, key: Uint8Array): Uint8Array {
  if (key.length !== KEY_BYTES) throw new EnvelopeError('Key must be 32 bytes', 'format');

  const nonce = randomBytes(NONCE_BYTES);
  const plaintext = utf8ToBytes(JSON.stringify(value));
  const ciphertext = xchacha20poly1305(key, nonce).encrypt(plaintext);

  const out = new Uint8Array(HEADER_BYTES + ciphertext.length);
  out.set(MAGIC, 0);
  out[MAGIC.length] = VERSION;
  out.set(nonce, MAGIC.length + 1);
  out.set(ciphertext, HEADER_BYTES);
  return out;
}

/**
 * Decrypts and parses. Throws `EnvelopeError` rather than returning a partial
 * result: a file that fails authentication has been tampered with or corrupted,
 * and the caller must decide what to do rather than silently loading garbage.
 */
export function open(blob: Uint8Array, key: Uint8Array): unknown {
  if (key.length !== KEY_BYTES) throw new EnvelopeError('Key must be 32 bytes', 'format');
  if (blob.length < HEADER_BYTES + 16) throw new EnvelopeError('File is too short', 'format');

  for (let i = 0; i < MAGIC.length; i += 1) {
    if (blob[i] !== MAGIC[i]) throw new EnvelopeError('Not a Red Letter data file', 'format');
  }

  const version = blob[MAGIC.length];
  if (version !== VERSION) {
    throw new EnvelopeError(`Unsupported file version ${String(version)}`, 'version');
  }

  const nonce = blob.subarray(MAGIC.length + 1, HEADER_BYTES);
  const ciphertext = blob.subarray(HEADER_BYTES);

  let plaintext: Uint8Array;
  try {
    plaintext = xchacha20poly1305(key, nonce).decrypt(ciphertext);
  } catch {
    // Poly1305 rejected the tag: wrong key, or the file was modified.
    throw new EnvelopeError('Could not authenticate the data file', 'authentication');
  }

  try {
    return JSON.parse(bytesToUtf8(plaintext));
  } catch {
    throw new EnvelopeError('Data file did not contain valid JSON', 'json');
  }
}
