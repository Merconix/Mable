import { useCallback, useEffect, useState } from 'react';
import { color, Text } from 'folds';
import { Button } from '$components/button';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { SettingTile } from '../../../components/setting-tile';
import {
  isIgnoringBatteryOptimizations,
  requestIgnoreBatteryOptimizations,
} from './UnifiedPushNotifications';

type BatteryOptimizationSettingProps = {
  active: boolean;
};

export function BatteryOptimizationSetting({ active }: BatteryOptimizationSettingProps) {
  const [ignoring, setIgnoring] = useState<boolean | null>(null);

  const refresh = useCallback(() => {
    void isIgnoringBatteryOptimizations().then(setIgnoring);
  }, []);

  const [requestState, requestExemption] = useAsyncCallback(
    useCallback(async () => {
      await requestIgnoreBatteryOptimizations();
    }, [])
  );

  useEffect(() => {
    if (!active) return undefined;

    refresh();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [active, refresh]);

  if (!active || ignoring !== false) return null;

  return (
    <SettingTile
      title="Battery optimization"
      focusId="embedded-push-battery-optimization"
      description="Android suspends the built-in distributor's connection while the device sleeps. Allow unrestricted battery use to keep notifications arriving."
      after={
        <Button
          size="300"
          radii="300"
          variant="Primary"
          fill="Soft"
          onClick={requestExemption}
          loading={requestState.status === AsyncStatus.Loading}
        >
          <Text size="B300">Allow</Text>
        </Button>
      }
    >
      {requestState.status === AsyncStatus.Error && (
        <Text as="span" style={{ color: color.Critical.Main }} size="T200">
          <br />
          Could not open the battery settings. Allow unrestricted battery use for Sable manually.
        </Text>
      )}
    </SettingTile>
  );
}
