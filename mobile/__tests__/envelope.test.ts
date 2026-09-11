import { base64ToBytes, bytesToBase64, bytesToUtf8, utf8ToBytes } from '../src/core/base64';
import { EnvelopeError, KEY_BYTES, newDataKey, open, seal } from '../src/core/envelope';

describe('base64', () => {
  it('round-trips arbitrary bytes', () => {
    for (const length of [0, 1, 2, 3, 4, 5, 31, 32, 255, 1024]) {
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i += 1) bytes[i] = (i * 7 + 13) % 256;

      expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
    }
  });

  it('matches the platform encoder', () => {
    const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255]);
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });

  it('rejects invalid input rather than returning junk', () => {
    expect(() => base64ToBytes('not base64!')).toThrow();
    expect(() => base64ToBytes('A')).toThrow();
  });
});

describe('utf8', () => {
  it('round-trips text including emoji and accents', () => {
    for (const text of ['', 'Dentist', 'café', 'naïve résumé', 'ceremony 💒', '日本語', 'a\u0000b']) {
      expect(bytesToUtf8(utf8ToBytes(text))).toBe(text);
    }
  });
});

describe('envelope', () => {
  const key = newDataKey();

  it('generates a 32-byte key', () => {
    expect(key).toHaveLength(KEY_BYTES);
  });

  it('generates a different key each time', () => {
    expect(Array.from(newDataKey())).not.toEqual(Array.from(newDataKey()));
  });

  it('round-trips data', () => {
    const data = {
      schemaVersion: 1,
      entries: { '2026-03-15': [{ id: 'abc', title: 'Wedding 💒', time: '14:00' }] },
      waiting: [],
    };
    expect(open(seal(data, key), key)).toEqual(data);
  });

  it('produces different ciphertext for identical input', () => {
    // A fresh nonce every write; two identical saves must not look identical.
    const a = seal({ x: 1 }, key);
    const b = seal({ x: 1 }, key);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it('does not leave plaintext visible in the blob', () => {
    const blob = seal({ entries: { '2026-03-15': [{ title: 'Oncologist' }] } }, key);
    expect(bytesToUtf8(blob)).not.toContain('Oncologist');
    expect(bytesToUtf8(blob)).not.toContain('2026-03-15');
  });

  it('refuses a blob encrypted under a different key', () => {
    const blob = seal({ x: 1 }, key);
    expect(() => open(blob, newDataKey())).toThrow(EnvelopeError);

    try {
      open(blob, newDataKey());
    } catch (error) {
      expect((error as EnvelopeError).reason).toBe('authentication');
    }
  });

  it('detects a single flipped bit anywhere in the ciphertext', () => {
    const blob = seal({ entries: {}, waiting: [], schemaVersion: 1 }, key);

    for (const index of [30, 40, blob.length - 1]) {
      const tampered = Uint8Array.from(blob);
      tampered[index] = (tampered[index] as number) ^ 0x01;
      expect(() => open(tampered, key)).toThrow(EnvelopeError);
    }
  });

  it('detects a flipped bit in the nonce', () => {
    const blob = seal({ x: 1 }, key);
    const tampered = Uint8Array.from(blob);
    tampered[6] = (tampered[6] as number) ^ 0x80;
    expect(() => open(tampered, key)).toThrow(EnvelopeError);
  });

  it('rejects a file that is not ours', () => {
    const notOurs = new Uint8Array(64);
    try {
      open(notOurs, key);
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as EnvelopeError).reason).toBe('format');
    }
  });

  it('rejects a truncated file', () => {
    const blob = seal({ x: 1 }, key);
    expect(() => open(blob.subarray(0, 20), key)).toThrow(EnvelopeError);
  });

  it('rejects an unknown format version', () => {
    const blob = seal({ x: 1 }, key);
    const tampered = Uint8Array.from(blob);
    tampered[4] = 99;

    try {
      open(tampered, key);
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as EnvelopeError).reason).toBe('version');
    }
  });

  it('refuses a key of the wrong length', () => {
    expect(() => seal({ x: 1 }, new Uint8Array(16))).toThrow(EnvelopeError);
    expect(() => open(seal({ x: 1 }, key), new Uint8Array(16))).toThrow(EnvelopeError);
  });

  it('handles a realistically large calendar', () => {
    const entries: Record<string, { id: string; title: string }[]> = {};
    for (let i = 1; i <= 28; i += 1) {
      const day = String(i).padStart(2, '0');
      entries[`2026-03-${day}`] = [{ id: `id${i}`, title: `Entry ${i}` }];
    }
    const data = { schemaVersion: 1, entries, waiting: [] };
    expect(open(seal(data, key), key)).toEqual(data);
  });
});
