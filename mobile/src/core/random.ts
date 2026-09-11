/**
 * Cryptographic randomness, with no weak fallback.
 *
 * Ids and encryption keys must never come from `Math.random`, so if no real
 * CSPRNG is available this throws rather than silently degrading. React Native
 * registers Expo's source at startup (see `src/storage/crypto.ts`); Node and
 * Jest use the platform WebCrypto implementation.
 */
export type RandomSource = (byteCount: number) => Uint8Array;

let source: RandomSource | null = null;

/** Installed once at app startup by the native layer. */
export function setRandomSource(next: RandomSource): void {
  source = next;
}

export function randomBytes(byteCount: number): Uint8Array {
  if (byteCount <= 0) throw new Error('randomBytes: byteCount must be positive');
  if (source) return source(byteCount);

  const webcrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (webcrypto?.getRandomValues) {
    return webcrypto.getRandomValues(new Uint8Array(byteCount));
  }
  throw new Error('No cryptographically secure random source is available');
}

const HEX = '0123456789abcdef';

export function randomHex(byteCount: number): string {
  const bytes = randomBytes(byteCount);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i] as number;
    out += HEX[byte >> 4] as string;
    out += HEX[byte & 0x0f] as string;
  }
  return out;
}

/**
 * Ids are opaque, app-generated and always safe to interpolate. Imported files
 * never supply one: the web version's escaping bug was an id from a backup file
 * breaking out of an HTML attribute, and regenerating removes the class of bug
 * rather than patching one instance of it.
 */
export function newId(): string {
  return randomHex(16);
}
