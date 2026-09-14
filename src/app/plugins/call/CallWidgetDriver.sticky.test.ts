import { describe, expect, it, vi } from 'vitest';
import type { MatrixClient, MatrixEvent, Room } from '$types/matrix-sdk';
import { CallWidgetDriver } from './CallWidgetDriver';

const roomId = '!room:example.org';
const userId = '@alice:example.org';
const deviceId = 'ALICEDEVICE';

const membership = { member: { id: `${userId}:${deviceId}` }, msc4354_sticky_key: 'key' };

const makeClient = (overrides: Partial<Record<string, unknown>> = {}) =>
  ({
    getDeviceId: () => deviceId,
    getSafeUserId: () => userId,
    getRoom: () => null,
    ...overrides,
  }) as unknown as MatrixClient;

describe('CallWidgetDriver sticky events', () => {
  it('sends a sticky event with its duration', async () => {
    const sendSticky = vi
      .fn<() => Promise<{ event_id: string }>>()
      .mockResolvedValue({ event_id: '$sticky' });
    const driver = new CallWidgetDriver(
      makeClient({ _unstable_sendStickyEvent: sendSticky }),
      roomId
    );

    await expect(
      driver.sendStickyEvent(3_600_000, 'org.matrix.msc4143.rtc.member', membership)
    ).resolves.toEqual({ roomId, eventId: '$sticky' });
    expect(sendSticky).toHaveBeenCalledWith(
      roomId,
      3_600_000,
      null,
      'org.matrix.msc4143.rtc.member',
      membership
    );
  });

  it('sends a delayed sticky event', async () => {
    const sendDelayedSticky = vi
      .fn<() => Promise<{ delay_id: string }>>()
      .mockResolvedValue({ delay_id: 'delay-1' });
    const driver = new CallWidgetDriver(
      makeClient({ _unstable_sendStickyDelayedEvent: sendDelayedSticky }),
      roomId
    );

    await expect(
      driver.sendDelayedStickyEvent(8_000, 3_600_000, 'org.matrix.msc4143.rtc.member', membership)
    ).resolves.toEqual({ roomId, delayId: 'delay-1' });
    expect(sendDelayedSticky).toHaveBeenCalledWith(
      roomId,
      3_600_000,
      { delay: 8_000 },
      null,
      'org.matrix.msc4143.rtc.member',
      membership
    );
  });

  it('reads the sticky events of a room', async () => {
    const event = { getEffectiveEvent: () => ({ event_id: '$one' }) } as unknown as MatrixEvent;
    const room = { _unstable_getStickyEvents: () => [event] } as unknown as Room;
    const driver = new CallWidgetDriver(makeClient({ getRoom: () => room }), roomId);

    await expect(driver.readStickyEvents(roomId)).resolves.toEqual([{ event_id: '$one' }]);
  });

  it('returns nothing for an unknown room', async () => {
    const driver = new CallWidgetDriver(makeClient(), roomId);

    await expect(driver.readStickyEvents(roomId)).resolves.toEqual([]);
  });
});
