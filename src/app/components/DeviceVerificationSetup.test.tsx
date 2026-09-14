import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CryptoApi } from '$types/matrix-sdk';
import { DeviceVerificationSetup } from './DeviceVerificationSetup';

const userHasCrossSigningKeys = vi.hoisted(() => vi.fn<() => Promise<boolean>>());
const createRecoveryKeyFromPassphrase = vi.hoisted(() =>
  vi.fn<CryptoApi['createRecoveryKeyFromPassphrase']>()
);
const bootstrapSecretStorage = vi.hoisted(() => vi.fn<() => Promise<void>>());
const bootstrapCrossSigning = vi.hoisted(() => vi.fn<() => Promise<void>>());
const resetKeyBackup = vi.hoisted(() => vi.fn<() => Promise<void>>());

vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => ({
    getSafeUserId: () => '@me:example.org',
    getCrypto: () =>
      ({
        userHasCrossSigningKeys,
        createRecoveryKeyFromPassphrase,
        bootstrapSecretStorage,
        bootstrapCrossSigning,
        resetKeyBackup,
      }) as unknown as CryptoApi,
  }),
}));

vi.mock('$client/secretStorageKeys', () => ({ clearSecretStorageKeys: vi.fn<() => void>() }));

const submitSetup = () => {
  const form = document.querySelector('form') as HTMLFormElement;
  fireEvent.submit(form);
};

describe('DeviceVerificationSetup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createRecoveryKeyFromPassphrase.mockResolvedValue({
      encodedPrivateKey: 'recovery-key',
      privateKey: new Uint8Array([1, 2, 3]),
    });
    bootstrapSecretStorage.mockResolvedValue(undefined);
    bootstrapCrossSigning.mockResolvedValue(undefined);
    resetKeyBackup.mockResolvedValue(undefined);
  });

  it('refuses to set up again when the account already has cross-signing keys', async () => {
    userHasCrossSigningKeys.mockResolvedValue(true);
    render(<DeviceVerificationSetup onCancel={() => undefined} />);

    submitSetup();

    await waitFor(() =>
      expect(screen.getByText(/already has device verification set up/)).toBeInTheDocument()
    );
    expect(createRecoveryKeyFromPassphrase).not.toHaveBeenCalled();
    expect(bootstrapSecretStorage).not.toHaveBeenCalled();
    expect(bootstrapCrossSigning).not.toHaveBeenCalled();
    expect(resetKeyBackup).not.toHaveBeenCalled();
  });

  it('sets up when the account has no cross-signing keys', async () => {
    userHasCrossSigningKeys.mockResolvedValue(false);
    render(<DeviceVerificationSetup onCancel={() => undefined} />);

    submitSetup();

    await waitFor(() => expect(bootstrapCrossSigning).toHaveBeenCalled());
    expect(resetKeyBackup).toHaveBeenCalled();
    expect(userHasCrossSigningKeys).toHaveBeenCalledWith('@me:example.org', true);
  });
});
