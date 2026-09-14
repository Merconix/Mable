import { render, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { NotificationTransportRuntimeFeature } from './NotificationTransportRuntimeFeature';

const mocks = vi.hoisted(() => ({
  enable: vi.fn<(...args: unknown[]) => Promise<{ endpoint: string }>>(),
  config: { pushTransport: { unifiedPushEmbeddedServerUrl: 'https://push.example' } } as {
    pushTransport?: { unifiedPushEmbeddedServerUrl?: string };
    pushNotificationDetails?: { unifiedPushEmbeddedServerUrl?: string };
  },
  overrides: {} as { unifiedPushEmbeddedServerUrl?: string },
  mx: {},
  setSetting: vi.fn<() => void>(),
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
vi.mock('@tauri-apps/plugin-os', () => ({ type: () => 'android' }));
vi.mock('$hooks/useMatrixClient', () => ({ useMatrixClient: () => mocks.mx }));
vi.mock('$hooks/useClientConfig', () => ({ useClientConfig: () => mocks.config }));
vi.mock('$state/hooks/settings', () => ({
  useSetting: (_atom: unknown, key: string) => [
    (
      {
        backgroundPushEnabled: true,
        backgroundPushProvider: 'unifiedpush',
        pushTransportMode: 'unifiedpush',
        pushTransportOverride: mocks.overrides,
      } as Record<string, unknown>
    )[key],
    mocks.setSetting,
  ],
}));
vi.mock('./UnifiedPushNotifications', () => ({
  enableUnifiedPush: mocks.enable,
  setEncryptedContentAllowed: async () => {},
  listenForUnifiedPushMessages: async () => ({ unregister: async () => {} }),
}));
vi.mock('./UnifiedPushTransport', () => ({ isUnifiedPushPermissionGranted: async () => true }));
vi.mock('./NativePushNotifications', () => ({
  enableNativePush: async () => {},
  isNativePushPermissionGranted: async () => true,
}));

beforeEach(() => {
  mocks.enable.mockReset().mockResolvedValue({ endpoint: 'https://push.example/topic' });
  mocks.overrides = {};
  mocks.config = { pushTransport: { unifiedPushEmbeddedServerUrl: 'https://push.example' } };
});

it('keeps the configured built-in server during startup registration', async () => {
  render(<NotificationTransportRuntimeFeature />);
  await waitFor(() =>
    expect(mocks.enable).toHaveBeenCalledWith(
      mocks.mx,
      expect.objectContaining({ unifiedPushEmbeddedServerUrl: 'https://push.example' })
    )
  );
});

it('uses the saved built-in server override during startup registration', async () => {
  mocks.overrides = { unifiedPushEmbeddedServerUrl: 'https://custom.example' };
  render(<NotificationTransportRuntimeFeature />);
  await waitFor(() =>
    expect(mocks.enable).toHaveBeenCalledWith(
      mocks.mx,
      expect.objectContaining({ unifiedPushEmbeddedServerUrl: 'https://custom.example' })
    )
  );
});

it('falls back to the built-in server from the push notification details', async () => {
  mocks.config = {
    pushNotificationDetails: { unifiedPushEmbeddedServerUrl: 'https://custom.example' },
  };
  render(<NotificationTransportRuntimeFeature />);
  await waitFor(() =>
    expect(mocks.enable).toHaveBeenCalledWith(
      mocks.mx,
      expect.objectContaining({ unifiedPushEmbeddedServerUrl: 'https://custom.example' })
    )
  );
});
