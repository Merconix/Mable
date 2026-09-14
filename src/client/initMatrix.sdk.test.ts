import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from '$types/matrix-sdk';
import type { Session } from '$state/sessions';
import { getSessionStoreName } from '$state/sessions';
import type * as MatrixSdkModule from 'matrix-js-sdk/lib/matrix';

const { isTauri, invoke, initRustCrypto } = vi.hoisted(() => ({
  isTauri: vi.fn<() => boolean>(() => false),
  invoke: vi.fn<(command: string, args?: unknown) => Promise<unknown>>(),
  initRustCrypto: vi.fn<(...args: unknown[]) => Promise<void>>(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke,
  isTauri,
}));

vi.mock('matrix-js-sdk/lib/matrix', async (importOriginal) => {
  const actual = await importOriginal<typeof MatrixSdkModule>();
  return {
    ...actual,
    createClient: (options: Parameters<typeof actual.createClient>[0]) => {
      const mx = actual.createClient(options);
      mx.initRustCrypto = initRustCrypto as MatrixClient['initRustCrypto'];
      mx.store.startup = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
      mx.store.destroy = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
      return mx;
    },
  };
});

vi.mock('./versionsCache', () => ({
  primeVersionsFromCache: vi.fn<() => Promise<boolean>>().mockResolvedValue(false),
  revalidateVersionsCache: vi.fn<() => void>(),
  clearCachedVersions: vi.fn<() => void>(),
  cacheVersionsFromClient: vi.fn<() => void>(),
  wasUnstableFeatureCached: vi.fn<() => boolean>().mockReturnValue(false),
}));

import { initClient, releaseCryptoStore } from './initMatrix';

const session = (userId: string): Session => ({
  baseUrl: 'https://example.org',
  userId,
  deviceId: 'DEVICE',
  accessToken: 'access-token',
});

const storeSentinel = async (name: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.addEventListener('error', () => reject(request.error));
    request.addEventListener('upgradeneeded', () => {
      request.result.createObjectStore('sentinels');
    });
    request.addEventListener('success', () => {
      const database = request.result;
      const transaction = database.transaction('sentinels', 'readwrite');
      transaction.objectStore('sentinels').put('preserved', 'crypto');
      transaction.addEventListener('complete', () => {
        database.close();
        resolve();
      });
      transaction.addEventListener('error', () => {
        database.close();
        reject(transaction.error);
      });
    });
  });

const readSentinel = async (name: string): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.addEventListener('error', () => reject(request.error));
    request.addEventListener('success', () => {
      const database = request.result;
      const transaction = database.transaction('sentinels');
      const get = transaction.objectStore('sentinels').get('crypto');
      get.addEventListener('success', () => resolve(get.result));
      get.addEventListener('error', () => reject(get.error));
      transaction.addEventListener('complete', () => database.close());
    });
  });

const createDeferred = (): { promise: Promise<void>; resolve: () => void } => {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

describe('initClient SDK crypto initialization', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    isTauri.mockReturnValue(false);
    invoke.mockResolvedValue(undefined);
    initRustCrypto.mockResolvedValue(undefined);
  });

  it.each([false, true])('initializes SDK crypto in %s runtime', async (tauri) => {
    isTauri.mockReturnValue(tauri);
    await initClient(session(`@sdk-${tauri ? 'tauri' : 'browser'}:example.org`));

    expect(initRustCrypto).toHaveBeenCalledWith({
      cryptoDatabasePrefix: expect.stringContaining('sync@sdk-'),
    });
    expect(invoke.mock.calls.some(([command]) => command === 'engine_store_exists')).toBe(tauri);
    expect(invoke.mock.calls.some(([command]) => command === 'engine_open')).toBe(false);
  });

  it('rejects when a native crypto store exists before SDK initialization', async () => {
    isTauri.mockReturnValue(true);
    invoke.mockImplementation(async (command) => command === 'engine_store_exists');

    await expect(initClient(session('@native-store:example.org'))).rejects.toMatchObject({
      name: 'NativeCryptoStoreError',
    });

    expect(initRustCrypto).not.toHaveBeenCalled();
    expect(invoke.mock.calls.some(([command]) => command === 'engine_open')).toBe(false);
    expect(invoke.mock.calls.some(([command]) => command === 'engine_wipe')).toBe(false);
  });

  it('preserves local stores when SDK crypto initialization reports an identity mismatch', async () => {
    const mismatch = new Error("Account in the store doesn't match account in the constructor");
    const failedSession = session('@mismatch:example.org');
    const storeName = getSessionStoreName(failedSession);
    const cryptoDatabase = `${storeName.rustCryptoPrefix}::matrix-sdk-crypto`;
    await storeSentinel(cryptoDatabase);
    initRustCrypto.mockRejectedValueOnce(mismatch);
    const deleteDatabase = vi.spyOn(indexedDB, 'deleteDatabase');
    vi.stubGlobal('location', { reload: vi.fn<() => void>() });

    await expect(initClient(failedSession)).resolves.toBeDefined();

    expect(initRustCrypto).toHaveBeenLastCalledWith({
      cryptoDatabasePrefix: storeName.rustCryptoPrefixPerDevice,
    });
    expect(await readSentinel(cryptoDatabase)).toBe('preserved');
    expect(deleteDatabase).not.toHaveBeenCalled();
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('surfaces a non-mismatch failure on the device scoped retry', async () => {
    const failedSession = session('@mismatch-then-broken:example.org');
    initRustCrypto
      .mockRejectedValueOnce(new Error("account in the store doesn't match"))
      .mockRejectedValueOnce(new Error('SDK startup failed'));

    await expect(initClient(failedSession)).rejects.toThrow('SDK startup failed');
    expect(initRustCrypto).toHaveBeenCalledTimes(2);
  });

  it('shares an in-flight SDK crypto initialization for the same session', async () => {
    const cryptoStartup = createDeferred();
    initRustCrypto.mockImplementation(() => cryptoStartup.promise);
    const pendingSession = session('@in-flight:example.org');

    const clients = Promise.all([initClient(pendingSession), initClient({ ...pendingSession })]);

    await vi.waitFor(() => expect(initRustCrypto).toHaveBeenCalledTimes(1));
    cryptoStartup.resolve();

    const [first, second] = await clients;
    expect(first).toBe(second);
  });

  it('rejects a conflicting session while encrypted storage is initializing', async () => {
    const cryptoStartup = createDeferred();
    initRustCrypto.mockImplementation(() => cryptoStartup.promise);
    const pendingSession = session('@in-flight-conflict:example.org');
    const first = initClient(pendingSession);

    await vi.waitFor(() => expect(initRustCrypto).toHaveBeenCalledTimes(1));
    await expect(
      initClient({ ...pendingSession, accessToken: 'different-access-token' })
    ).rejects.toThrow('A different session is already initializing encrypted storage');
    expect(initRustCrypto).toHaveBeenCalledTimes(1);

    cryptoStartup.resolve();
    await first;
  });

  it('does not hand a new device the previous device crypto store', async () => {
    const onOldDevice: Session = { ...session('@relogin:example.org'), deviceId: 'OLDDEVICE' };
    const onNewDevice: Session = { ...onOldDevice, deviceId: 'NEWDEVICE' };

    releaseCryptoStore(await initClient(onOldDevice));
    initRustCrypto.mockClear();
    initRustCrypto.mockRejectedValueOnce(new Error("account in the store doesn't match"));

    await expect(initClient(onNewDevice)).resolves.toBeDefined();

    expect(initRustCrypto).toHaveBeenLastCalledWith({
      cryptoDatabasePrefix: getSessionStoreName(onNewDevice).rustCryptoPrefixPerDevice,
    });
  });

  it('allows a retry after an initialization failure', async () => {
    const failedSession = session('@retry-after-failure:example.org');
    initRustCrypto.mockRejectedValueOnce(new Error('SDK startup failed'));

    await expect(initClient(failedSession)).rejects.toThrow('SDK startup failed');
    await expect(initClient({ ...failedSession })).resolves.toBeDefined();
    expect(initRustCrypto).toHaveBeenCalledTimes(2);
  });
});
