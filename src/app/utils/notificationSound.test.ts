import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { playNotificationSound as PlayNotificationSound } from './notificationSound';

let playNotificationSound: typeof PlayNotificationSound;

type MockSource = {
  buffer: AudioBuffer | null;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  ended: (() => void) | undefined;
};

const nativeAudioContext = globalThis.AudioContext;
const nativeFetch = globalThis.fetch;
let sources: MockSource[];
let audioContexts: MockAudioContext[];
let failToStartAudioDevice = false;

class MockAudioContext {
  public state: AudioContextState = 'running';
  public destination = {} as AudioDestinationNode;

  public decodeAudioData = vi.fn<() => Promise<AudioBuffer>>().mockResolvedValue({} as AudioBuffer);
  public resume = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  public close = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  public createBufferSource = vi.fn<() => AudioBufferSourceNode>(() => {
    const source: MockSource = {
      buffer: null,
      connect: vi.fn<() => void>(),
      disconnect: vi.fn<() => void>(),
      start: vi.fn<() => void>(() => {
        if (failToStartAudioDevice) {
          failToStartAudioDevice = false;
          throw new DOMException('Failed to start the audio device', 'InvalidStateError');
        }
      }),
      addEventListener: vi.fn<(type: string, listener: () => void) => void>((type, listener) => {
        if (type === 'ended') source.ended = listener;
      }),
      ended: undefined,
    };
    sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  });

  public constructor() {
    audioContexts.push(this);
  }
}

beforeEach(async () => {
  vi.resetModules();
  ({ playNotificationSound } = await import('./notificationSound'));
  sources = [];
  audioContexts = [];
  failToStartAudioDevice = false;
  globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext;
  globalThis.fetch = vi.fn<() => Promise<Response>>().mockResolvedValue({
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  } as Response);
});

afterEach(() => {
  globalThis.AudioContext = nativeAudioContext;
  globalThis.fetch = nativeFetch;
});

describe('playNotificationSound', () => {
  it('does not overlap sounds requested while one is playing', async () => {
    await Promise.all([
      playNotificationSound('/sound/notification.ogg'),
      playNotificationSound('/sound/notification.ogg'),
    ]);

    expect(sources).toHaveLength(1);

    sources[0]!.ended?.();
    await playNotificationSound('/sound/notification.ogg');

    expect(sources).toHaveLength(2);
    sources[1]!.ended?.();
  });

  it('recovers after the audio device rejects a buffer source', async () => {
    failToStartAudioDevice = true;

    await expect(playNotificationSound('/sound/notification.ogg')).rejects.toMatchObject({
      name: 'InvalidStateError',
      message: 'Failed to start the audio device',
    });

    await playNotificationSound('/sound/notification.ogg');

    expect(audioContexts).toHaveLength(2);
    expect(sources).toHaveLength(2);
    expect(audioContexts[0]!.close).toHaveBeenCalledOnce();
    expect(sources[0]!.disconnect).toHaveBeenCalledOnce();
  });
});
