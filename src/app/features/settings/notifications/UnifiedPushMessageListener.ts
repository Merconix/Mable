import { createDebugLogger } from '$utils/debugLogger';

const listenerLog = createDebugLogger('unifiedpush-listener');

const dropPush = (reason: string, data?: unknown): null => {
  listenerLog.warn('notification', `Dropped push: ${reason}`, data);
  return null;
};

export type UnifiedPushMessageHandler = (data: Record<string, unknown>) => Promise<void>;
export type UnifiedPushMessageErrorHandler = (error: unknown) => void;

export function createUnifiedPushMessageListener(
  handler: UnifiedPushMessageHandler,
  onError: UnifiedPushMessageErrorHandler
) {
  return (data: Record<string, unknown>) => {
    handler(data).catch(onError);
  };
}

export function parseUnifiedPushMessage(raw: unknown): Record<string, unknown> | null {
  const message = (raw as { message?: unknown })?.message;
  if (typeof message !== 'string') return dropPush('no message string');

  let payload: unknown;
  try {
    payload = JSON.parse(message);
  } catch {
    return dropPush('unparsable message');
  }
  if (!isRecord(payload)) return dropPush('message is not an object');

  let notification = payload.notification === undefined ? payload : payload.notification;
  if (typeof notification === 'string') {
    try {
      notification = JSON.parse(notification);
    } catch {
      return dropPush('unparsable notification');
    }
  }
  if (!isRecord(notification)) return dropPush('notification is not an object');

  const recipients = new Set<string>();
  const addRecipient = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) recipients.add(value.trim());
  };
  addRecipient(payload.user_id);
  addRecipient(notification.user_id);
  if (Array.isArray(notification.devices)) {
    for (const device of notification.devices) {
      if (!isRecord(device) || !isRecord(device.data)) continue;
      addRecipient(device.data.user_id);
      if (isRecord(device.data.default_payload)) {
        addRecipient(device.data.default_payload.user_id);
      }
    }
  }
  if (recipients.size > 1) {
    return dropPush('several recipients', { recipientCount: recipients.size });
  }
  const [userId] = recipients;
  return userId ? { ...notification, user_id: userId } : notification;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
