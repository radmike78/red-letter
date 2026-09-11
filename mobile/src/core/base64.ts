/**
 * Base64 for binary data.
 *
 * React Native has no `Buffer` and its `atob`/`btoa` are unreliable for
 * non-Latin1 bytes, so this is done explicitly. It is only ever used on the
 * encryption key and the encrypted blob, both of which are raw bytes.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const LOOKUP: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i += 1) LOOKUP[ALPHABET[i] as string] = i;

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number;
    const b = bytes[i + 1];
    const c = bytes[i + 2];

    out += ALPHABET[a >> 2] as string;

    if (b === undefined) {
      out += ALPHABET[(a & 0x03) << 4] as string;
      out += '==';
      break;
    }
    out += ALPHABET[((a & 0x03) << 4) | (b >> 4)] as string;

    if (c === undefined) {
      out += ALPHABET[(b & 0x0f) << 2] as string;
      out += '=';
      break;
    }
    out += ALPHABET[((b & 0x0f) << 2) | (c >> 6)] as string;
    out += ALPHABET[c & 0x3f] as string;
  }
  return out;
}

/** Throws on anything that is not valid base64; callers treat that as corruption. */
export function base64ToBytes(value: string): Uint8Array {
  const clean = value.replace(/[\r\n\s]/g, '').replace(/=+$/, '');
  if (clean.length % 4 === 1) throw new Error('base64: truncated input');

  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let outIndex = 0;
  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i] as string;
    const value6 = LOOKUP[char];
    if (value6 === undefined) throw new Error('base64: invalid character');

    buffer = (buffer << 6) | value6;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[outIndex] = (buffer >> bits) & 0xff;
      outIndex += 1;
    }
  }
  return out.subarray(0, outIndex);
}

/** UTF-8 encode/decode without relying on a platform TextEncoder. */
export function utf8ToBytes(text: string): Uint8Array {
  const encoder = (globalThis as { TextEncoder?: typeof TextEncoder }).TextEncoder;
  if (encoder) return new encoder().encode(text);

  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        i += 1;
      }
    }
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return new Uint8Array(out);
}

export function bytesToUtf8(bytes: Uint8Array): string {
  const decoder = (globalThis as { TextDecoder?: typeof TextDecoder }).TextDecoder;
  if (decoder) return new decoder('utf-8', { fatal: false }).decode(bytes);

  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const byte = bytes[i] as number;
    let code: number;
    let size: number;

    if (byte < 0x80) { code = byte; size = 1; }
    else if ((byte & 0xe0) === 0xc0) { code = byte & 0x1f; size = 2; }
    else if ((byte & 0xf0) === 0xe0) { code = byte & 0x0f; size = 3; }
    else { code = byte & 0x07; size = 4; }

    for (let j = 1; j < size; j += 1) code = (code << 6) | ((bytes[i + j] as number) & 0x3f);

    if (code > 0xffff) {
      code -= 0x10000;
      out += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
    } else {
      out += String.fromCharCode(code);
    }
    i += size;
  }
  return out;
}
