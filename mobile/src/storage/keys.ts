import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { base64ToBytes, bytesToBase64 } from '../core/base64';
import { KEY_BYTES, newDataKey } from '../core/envelope';
import { setRandomSource } from '../core/random';

/**
 * The data-encryption key lives in the iOS Keychain / Android Keystore and
 * nowhere else. It is never written to the documents directory, never put in
 * AsyncStorage or SharedPreferences, and never logged.
 */
const DATA_KEY_ID = 'redletter.datakey.v1';

/**
 * `WHEN_UNLOCKED` rather than `..._THIS_DEVICE_ONLY`.
 *
 * This is a deliberate trade. Device-only would be marginally stronger, but on
 * iOS it also means the key cannot travel in an encrypted iCloud Keychain
 * restore, so a user replacing their phone would silently lose every marked day
 * they had. For a calendar of anniversaries and appointments that is a worse
 * outcome than the threat it defends against, and iCloud Keychain is itself
 * end-to-end encrypted.
 *
 * On Android, Keystore material is device-bound regardless of this setting, so
 * the encrypted export in Settings is the migration path on both platforms.
 */
const ACCESSIBILITY = SecureStore.WHEN_UNLOCKED;

let installed = false;

/**
 * Points the app's randomness at the platform CSPRNG. Must run before anything
 * generates an id or a key; `src/core/random.ts` throws rather than falling
 * back to `Math.random` if this was missed.
 */
export function installPlatformRandom(): void {
  if (installed) return;
  setRandomSource((byteCount) => Crypto.getRandomBytes(byteCount));
  installed = true;
}

export class KeyStoreUnavailableError extends Error {
  constructor() {
    super('This device has no secure keystore available');
    this.name = 'KeyStoreUnavailableError';
  }
}

/**
 * Returns the device's data key, creating one on first launch.
 *
 * A key that is present but the wrong length is treated as corruption and
 * replaced. That does orphan the existing data file, but a wrong-length key
 * cannot decrypt it either, and leaving the app permanently unable to start is
 * worse than starting empty.
 */
export async function getOrCreateDataKey(): Promise<Uint8Array> {
  installPlatformRandom();

  if (!(await SecureStore.isAvailableAsync())) {
    throw new KeyStoreUnavailableError();
  }

  const existing = await SecureStore.getItemAsync(DATA_KEY_ID, {
    keychainAccessible: ACCESSIBILITY,
  });

  if (existing !== null) {
    try {
      const bytes = base64ToBytes(existing);
      if (bytes.length === KEY_BYTES) return bytes;
    } catch {
      // Falls through to generating a replacement.
    }
  }

  const key = newDataKey();
  await SecureStore.setItemAsync(DATA_KEY_ID, bytesToBase64(key), {
    keychainAccessible: ACCESSIBILITY,
  });
  return key;
}

/** Used by "Delete everything" in Settings. */
export async function destroyDataKey(): Promise<void> {
  await SecureStore.deleteItemAsync(DATA_KEY_ID, { keychainAccessible: ACCESSIBILITY });
}
