import type { CryptoApi, MatrixClient } from '$types/matrix-sdk';

export const verifiedDevice = async (
  api: CryptoApi,
  userId: string,
  deviceId: string
): Promise<boolean | null> => {
  const status = await api.getDeviceVerificationStatus(userId, deviceId);

  if (!status) return null;

  return status.crossSigningVerified;
};

const CROSS_SIGNING_SECRETS = [
  'm.cross_signing.master',
  'm.cross_signing.self_signing',
  'm.cross_signing.user_signing',
];

// `bootstrapCrossSigning` mints a new identity and writes it to 4S when it cannot read the keys,
// and account data missing from the local store reads as "no keys".
export const restoreCrossSigningFromSecretStorage = async (
  mx: MatrixClient,
  crypto: CryptoApi
): Promise<void> => {
  const storedKeys = await Promise.all(
    CROSS_SIGNING_SECRETS.map((secretName) => mx.secretStorage.get(secretName))
  );

  if (storedKeys.some((key) => !key)) {
    throw new Error(
      'Could not read your cross-signing keys from secret storage. Wait for the sync to finish and try again.'
    );
  }

  await crypto.bootstrapCrossSigning({
    authUploadDeviceSigningKeys: async () => {
      throw new Error('Refusing to replace your cross-signing identity to verify this device.');
    },
  });
};
