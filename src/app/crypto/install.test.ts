import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isTauri } from '@tauri-apps/api/core';
import {
  engineClose,
  engineInvoke,
  engineOpen,
  engineStoreExists,
} from '$generated/tauri/commands';
import {
  ensureSdkCryptoCanStart,
  isNativeCryptoStoreError,
  NativeCryptoStoreError,
} from './install';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: vi.fn<() => boolean>() }));
vi.mock('$generated/tauri/commands', () => ({
  engineClose: vi.fn<typeof engineClose>(),
  engineInvoke: vi.fn<typeof engineInvoke>(),
  engineOpen: vi.fn<typeof engineOpen>(),
  engineStoreExists: vi.fn<typeof engineStoreExists>(),
}));

const mockIsTauri = vi.mocked(isTauri);
const mockEngineClose = vi.mocked(engineClose);
const mockEngineInvoke = vi.mocked(engineInvoke);
const mockEngineOpen = vi.mocked(engineOpen);
const mockEngineStoreExists = vi.mocked(engineStoreExists);

describe('ensureSdkCryptoCanStart', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('starts SDK crypto outside Tauri without inspecting a native store', async () => {
    mockIsTauri.mockReturnValue(false);

    await expect(ensureSdkCryptoCanStart('@alice:example.org', 'ALICE')).resolves.toBeUndefined();

    expect(mockEngineStoreExists).not.toHaveBeenCalled();
  });

  it('starts SDK crypto when no native store exists', async () => {
    mockIsTauri.mockReturnValue(true);
    mockEngineStoreExists.mockResolvedValue(false);

    await expect(ensureSdkCryptoCanStart('@alice:example.org', 'ALICE')).resolves.toBeUndefined();
  });

  it('blocks SDK initialization when a native store exists', async () => {
    mockIsTauri.mockReturnValue(true);
    mockEngineStoreExists.mockResolvedValue(true);

    await expect(ensureSdkCryptoCanStart('@alice:example.org', 'ALICE')).rejects.toBeInstanceOf(
      NativeCryptoStoreError
    );
  });
});

describe('NativeCryptoStoreError', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('exports the unwrapped room-key JSON and closes the native store', async () => {
    mockEngineStoreExists.mockResolvedValue(true);
    mockEngineOpen.mockResolvedValue({} as never);
    mockEngineInvoke.mockResolvedValue(JSON.stringify('[{"session_id":"session"}]'));
    mockEngineClose.mockResolvedValue(true);
    const error = new NativeCryptoStoreError('@alice:example.org', 'ALICE');

    await expect(error.exportRoomKeys()).resolves.toBe('[{"session_id":"session"}]');

    expect(mockEngineInvoke).toHaveBeenCalledWith({
      userId: '@alice:example.org',
      deviceId: 'ALICE',
      method: 'exportRoomKeys',
      argsJson: '{}',
    });
    expect(mockEngineClose).toHaveBeenCalledWith({
      userId: '@alice:example.org',
      deviceId: 'ALICE',
    });
  });

  it('does not create a native store after it has disappeared', async () => {
    mockEngineStoreExists.mockResolvedValue(false);
    const error = new NativeCryptoStoreError('@alice:example.org', 'ALICE');

    await expect(error.exportRoomKeys()).rejects.toThrow('no longer available');

    expect(mockEngineOpen).not.toHaveBeenCalled();
  });

  it('closes the native store when export fails', async () => {
    mockEngineStoreExists.mockResolvedValue(true);
    mockEngineOpen.mockResolvedValue({} as never);
    mockEngineInvoke.mockRejectedValue(new Error('export failed'));
    mockEngineClose.mockResolvedValue(true);
    const error = new NativeCryptoStoreError('@alice:example.org', 'ALICE');

    await expect(error.exportRoomKeys()).rejects.toThrow('export failed');

    expect(mockEngineClose).toHaveBeenCalledWith({
      userId: '@alice:example.org',
      deviceId: 'ALICE',
    });
  });

  it('identifies the recovery error', () => {
    expect(
      isNativeCryptoStoreError(new NativeCryptoStoreError('@alice:example.org', 'ALICE'))
    ).toBe(true);
  });
});
