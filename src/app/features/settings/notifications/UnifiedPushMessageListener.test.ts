import { describe, expect, it, vi } from 'vitest';

type LogFn = (category: string, message: string, data?: unknown) => void;

const { warn } = vi.hoisted(() => ({
  warn: vi.fn<LogFn>(),
}));

vi.mock('$utils/debugLogger', () => ({
  createDebugLogger: () => ({
    debug: vi.fn<LogFn>(),
    info: vi.fn<LogFn>(),
    warn,
    error: vi.fn<LogFn>(),
  }),
}));

import {
  createUnifiedPushMessageListener,
  parseUnifiedPushMessage,
} from './UnifiedPushMessageListener';

describe('createUnifiedPushMessageListener', () => {
  it('catches rejected payload handlers instead of leaking unhandled rejections', async () => {
    const onError = vi.fn<(error: unknown) => void>();
    const listener = createUnifiedPushMessageListener(async () => {
      throw new Error('boom');
    }, onError);

    expect(listener({})).toBeUndefined();
    await Promise.resolve();

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }));
  });
});

describe('parseUnifiedPushMessage', () => {
  it('unwraps the Matrix notification from the message JSON string', () => {
    const raw = {
      message: JSON.stringify({
        notification: { type: 'm.room.message', room_id: '!r:server', event_id: '$e' },
      }),
    };

    expect(parseUnifiedPushMessage(raw)).toEqual({
      type: 'm.room.message',
      room_id: '!r:server',
      event_id: '$e',
    });
  });

  it('returns the payload as-is when there is no notification wrapper', () => {
    const raw = { message: JSON.stringify({ event_id: '$e', room_id: '!r:server' }) };

    expect(parseUnifiedPushMessage(raw)).toEqual({ event_id: '$e', room_id: '!r:server' });
  });

  it('returns null for a missing or non-JSON message', () => {
    expect(parseUnifiedPushMessage({})).toBeNull();
    expect(parseUnifiedPushMessage({ message: 'not json' })).toBeNull();
  });

  it.each(['flat', 'object', 'string'])(
    'preserves gateway recipients in %s payloads',
    (wrapper) => {
      for (const recipient of ['notification', 'envelope', 'device', 'default_payload']) {
        const notification: Record<string, unknown> = { room_id: '!r:server', event_id: '$e' };
        const envelope: Record<string, unknown> = wrapper === 'flat' ? notification : {};
        if (recipient === 'notification') notification.user_id = '@a:server';
        else if (recipient === 'envelope') envelope.user_id = '@a:server';
        else
          notification.devices = [
            {
              data:
                recipient === 'device'
                  ? { user_id: '@a:server' }
                  : { default_payload: { user_id: '@a:server' } },
            },
          ];
        if (wrapper === 'object') envelope.notification = notification;
        if (wrapper === 'string') envelope.notification = JSON.stringify(notification);
        expect(parseUnifiedPushMessage({ message: JSON.stringify(envelope) })).toMatchObject({
          room_id: '!r:server',
          event_id: '$e',
          user_id: '@a:server',
        });
      }
    }
  );

  it('rejects conflicting account identities, including device defaults', () => {
    expect(
      parseUnifiedPushMessage({
        message: JSON.stringify({
          user_id: '@a:server',
          notification: { user_id: '@b:server' },
        }),
      })
    ).toBeNull();
    expect(
      parseUnifiedPushMessage({
        message: JSON.stringify({
          notification: {
            devices: ['@a:server', '@b:server'].map((user_id) => ({
              data: { default_payload: { user_id } },
            })),
          },
        }),
      })
    ).toBeNull();
  });

  it('accepts string-encoded notifications while preserving the envelope recipient', () => {
    expect(
      parseUnifiedPushMessage({
        message: JSON.stringify({
          user_id: '@a:server',
          notification: JSON.stringify({ room_id: '!r:server', event_id: '$e' }),
        }),
      })
    ).toEqual({ room_id: '!r:server', event_id: '$e', user_id: '@a:server' });
  });

  it('rejects non-object payloads and wrappers', () => {
    for (const payload of [
      [],
      null,
      1,
      { notification: null },
      { notification: [] },
      { notification: 'invalid' },
    ]) {
      expect(parseUnifiedPushMessage({ message: JSON.stringify(payload) })).toBeNull();
    }
  });

  it('reports a dropped push instead of discarding it silently', () => {
    warn.mockClear();

    expect(
      parseUnifiedPushMessage({
        message: JSON.stringify({
          user_id: '@a:server',
          notification: { user_id: '@b:server', room_id: '!r:server' },
        }),
      })
    ).toBeNull();

    expect(warn).toHaveBeenCalledWith('notification', expect.stringContaining('Dropped push'), {
      recipientCount: 2,
    });
  });

  it('reports an unparsable push', () => {
    warn.mockClear();

    expect(parseUnifiedPushMessage({ message: 'not json' })).toBeNull();

    expect(warn).toHaveBeenCalledWith(
      'notification',
      expect.stringContaining('Dropped push'),
      undefined
    );
  });
});
