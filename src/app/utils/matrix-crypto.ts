import type { CryptoApi, MatrixClient } from '$types/matrix-sdk';
import { fetch } from '$utils/fetch';

export const verifiedDevice = async (
  api: CryptoApi,
  userId: string,
  deviceId: string
): Promise<boolean | null> => {
  const status = await api.getDeviceVerificationStatus(userId, deviceId);

  if (!status) return null;

  return status.crossSigningVerified;
};

type KeysQueryResponse = {
  device_keys?: Record<string, Record<string, { keys?: Record<string, string> }>>;
  master_keys?: Record<string, { keys?: Record<string, string> }>;
};

/** What the homeserver currently publishes for our own user; undefined where it has nothing. */
export type PublishedIdentity = {
  deviceKey: string | undefined;
  masterKeyId: string | undefined;
};

export const fetchPublishedIdentity = async (
  baseUrl: string,
  accessToken: string,
  userId: string,
  deviceId: string
): Promise<PublishedIdentity> => {
  const response = await fetch(`${baseUrl}/_matrix/client/v3/keys/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ device_keys: { [userId]: [deviceId] } }),
  });
  if (!response.ok) throw new Error(`Failed to read published device keys (${response.status})`);

  const body = (await response.json()) as KeysQueryResponse;
  const masterKeys = body.master_keys?.[userId]?.keys;
  return {
    deviceKey: body.device_keys?.[userId]?.[deviceId]?.keys?.[`ed25519:${deviceId}`],
    masterKeyId: masterKeys ? Object.values(masterKeys)[0] : undefined,
  };
};

export const fetchPublishedDeviceKey = async (
  baseUrl: string,
  accessToken: string,
  userId: string,
  deviceId: string
): Promise<string | undefined> =>
  (await fetchPublishedIdentity(baseUrl, accessToken, userId, deviceId)).deviceKey;

// `/keys/signatures/upload` answers 200 with a `failures` map, so a rejected self-signature never
// throws and the device keeps reporting itself as verified until the next device list refresh.
const assertDeviceSignedItself = async (mx: MatrixClient, crypto: CryptoApi): Promise<void> => {
  const userId = mx.getSafeUserId();
  const deviceId = mx.getDeviceId();
  if (!deviceId) throw new Error('Unexpected Error! This session has no device id.');

  if ((await verifiedDevice(crypto, userId, deviceId)) !== true) {
    throw new Error('This device could not be signed by your cross-signing identity.');
  }

  // The local machine signs its own keys, so only the server's view says whether it can stick.
  const [ownKeys, localMasterKeyId, published] = await Promise.all([
    crypto.getOwnDeviceKeys(),
    crypto.getCrossSigningKeyId(),
    fetchPublishedIdentity(mx.baseUrl, mx.getAccessToken() ?? '', userId, deviceId),
  ]);

  if (published.deviceKey !== undefined && published.deviceKey !== ownKeys.ed25519) {
    throw new Error(
      'This device no longer matches the encryption keys your account published for it, so it cannot be verified. Sign out and sign in again to continue using encrypted chats.'
    );
  }

  // Recovery keys outlive their identity; signing with a superseded one is discarded server-side.
  if (
    published.masterKeyId !== undefined &&
    localMasterKeyId !== null &&
    published.masterKeyId !== localMasterKeyId
  ) {
    throw new Error(
      'Your recovery key unlocks a previous verification identity, not the one your account uses now. Verify with another signed-in device, or reset verification from Settings to start a new identity.'
    );
  }
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

  await assertDeviceSignedItself(mx, crypto);
};
