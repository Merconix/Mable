import { useQuery } from '@tanstack/react-query';
import type { SecretAccountData } from '$types/matrix/accountData';

import { useAccountData } from './useAccountData';
import { useMatrixClient } from './useMatrixClient';

export enum CrossSigningStatus {
  Unknown,
  Active,
  Inactive,
}

// `getAccountData` reads the local store, so an unsynced account is indistinguishable from one
// that never set cross-signing up, and setting it up again resets it.
export const useCrossSigningStatus = (): CrossSigningStatus => {
  const mx = useMatrixClient();
  const masterEvent = useAccountData('m.cross_signing.master');
  const storedLocally = !!masterEvent?.getContent<SecretAccountData>();

  const { data } = useQuery({
    queryKey: ['cross-signing-keys', mx.getSafeUserId()],
    queryFn: async () => {
      const crypto = mx.getCrypto();
      if (!crypto) return null;
      // An untracked own user reports false unless the key list is downloaded.
      return crypto.userHasCrossSigningKeys(mx.getSafeUserId(), true);
    },
    enabled: !storedLocally,
    staleTime: 60000,
  });

  if (storedLocally) return CrossSigningStatus.Active;
  if (typeof data !== 'boolean') return CrossSigningStatus.Unknown;
  return data ? CrossSigningStatus.Active : CrossSigningStatus.Inactive;
};

export const useCrossSigningActive = (): boolean =>
  useCrossSigningStatus() === CrossSigningStatus.Active;
