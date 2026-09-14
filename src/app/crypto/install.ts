import { isTauri } from '@tauri-apps/api/core';
import {
  engineClose,
  engineInvoke,
  engineOpen,
  engineStoreExists,
} from '$generated/tauri/commands';

export class NativeCryptoStoreError extends Error {
  readonly exportRoomKeys: () => Promise<string>;

  constructor(userId: string, deviceId: string) {
    super(
      'This installation has encrypted-message keys that need to be exported before signing in again.'
    );
    this.name = 'NativeCryptoStoreError';
    this.exportRoomKeys = async () => {
      if (!(await engineStoreExists({ userId, deviceId }))) {
        throw new Error('The encrypted-message keys are no longer available on this installation.');
      }
      await engineOpen({ dir: null, passphrase: null, userId, deviceId });
      try {
        const raw = await engineInvoke({
          userId,
          deviceId,
          method: 'exportRoomKeys',
          argsJson: '{}',
        });
        return JSON.parse(raw) as string;
      } finally {
        await engineClose({ userId, deviceId });
      }
    };
  }
}

export const isNativeCryptoStoreError = (error: unknown): error is NativeCryptoStoreError =>
  error instanceof NativeCryptoStoreError;

export const ensureSdkCryptoCanStart = async (userId: string, deviceId: string): Promise<void> => {
  if (!isTauri()) return;
  if (await engineStoreExists({ userId, deviceId }))
    throw new NativeCryptoStoreError(userId, deviceId);
};
