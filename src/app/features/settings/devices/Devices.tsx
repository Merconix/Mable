import { useEffect } from 'react';
import { Box, Text, Scroll } from 'folds';
import { PageContent, SettingsSectionPage } from '$components/page';
import { SequenceCard, SequenceCardStyle } from '$components/sequence-card';
import { SettingTile } from '$components/setting-tile';
import { useDeviceIds, useDeviceList, useSplitCurrentDevice } from '$hooks/useDeviceList';
import { useMatrixClient } from '$hooks/useMatrixClient';
import type { CryptoBackend } from '$types/matrix-sdk';
import {
  useDeviceVerificationStatus,
  useVerifiedDeviceCount,
  useUnverifiedDeviceCount,
  VerificationStatus,
} from '$hooks/useDeviceVerificationStatus';
import { useSecretStorageDefaultKeyId, useSecretStorageKeyContent } from '$hooks/useSecretStorage';
import { CrossSigningStatus, useCrossSigningStatus } from '$hooks/useCrossSigning';
import { BackupRestoreTile } from '$components/BackupRestore';
import { LocalBackup } from './LocalBackup';
import { DeviceLogoutBtn, DeviceKeyDetails, DeviceTile, DeviceTilePlaceholder } from './DeviceTile';
import { OtherDevices } from './OtherDevices';
import {
  DeviceVerificationOptions,
  EnableVerification,
  VerificationStatusBadge,
  VerifyCurrentDeviceTile,
} from './Verification';

function DevicesPlaceholder() {
  return (
    <Box direction="Column" gap="100">
      <DeviceTilePlaceholder />
      <DeviceTilePlaceholder />
    </Box>
  );
}

type DevicesProps = {
  requestBack?: () => void;
  requestClose: () => void;
};
export function Devices({ requestBack, requestClose }: DevicesProps) {
  const mx = useMatrixClient();
  const crypto = mx.getCrypto();
  const crossSigningStatus = useCrossSigningStatus();
  const crossSigningActive = crossSigningStatus === CrossSigningStatus.Active;
  const [devices, refreshDeviceList] = useDeviceList();

  useEffect(() => {
    void (crypto as CryptoBackend | undefined)?.processDeviceLists({
      changed: [mx.getSafeUserId()],
    });
  }, [crypto, mx]);

  const [currentDevice, otherDevices] = useSplitCurrentDevice(devices);
  const verificationStatus = useDeviceVerificationStatus(
    crypto,
    mx.getSafeUserId(),
    currentDevice?.device_id
  );

  const otherDevicesId = useDeviceIds(otherDevices);
  const verifiedDeviceCount = useVerifiedDeviceCount(crypto, mx.getSafeUserId(), otherDevicesId);
  const unverifiedDeviceCount = useUnverifiedDeviceCount(
    crypto,
    mx.getSafeUserId(),
    otherDevicesId
  );

  const defaultSecretStorageKeyId = useSecretStorageDefaultKeyId();
  const defaultSecretStorageKeyContent = useSecretStorageKeyContent(
    defaultSecretStorageKeyId ?? ''
  );

  return (
    <SettingsSectionPage title="Devices" requestBack={requestBack} requestClose={requestClose}>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="700">
              <Box direction="Column" gap="100">
                <Text size="L400">Security</Text>
                <SequenceCard
                  className={SequenceCardStyle}
                  variant="SurfaceVariant"
                  direction="Column"
                  gap="400"
                >
                  <SettingTile
                    title="Device Verification"
                    focusId="device-verification"
                    description="To verify device identity and grant access to encrypted messages."
                    after={
                      <>
                        <EnableVerification
                          visible={!crossSigningActive}
                          loading={crossSigningStatus === CrossSigningStatus.Unknown}
                        />
                        {crossSigningActive && (
                          <Box gap="200" alignItems="Center">
                            <VerificationStatusBadge
                              verificationStatus={verificationStatus}
                              otherUnverifiedCount={unverifiedDeviceCount}
                            />
                            <DeviceVerificationOptions />
                          </Box>
                        )}
                      </>
                    }
                  />
                </SequenceCard>
              </Box>
              <Box direction="Column" gap="100">
                <Text size="L400">Current</Text>
                {currentDevice ? (
                  <SequenceCard
                    className={SequenceCardStyle}
                    variant="SurfaceVariant"
                    direction="Column"
                    gap="400"
                  >
                    <DeviceTile
                      device={currentDevice}
                      refreshDeviceList={refreshDeviceList}
                      options={<DeviceLogoutBtn />}
                    >
                      {crypto && <DeviceKeyDetails crypto={crypto} />}
                    </DeviceTile>
                    {crossSigningActive && verificationStatus === VerificationStatus.Unverified && (
                      <VerifyCurrentDeviceTile
                        secretStorageKeyId={defaultSecretStorageKeyId}
                        secretStorageKeyContent={defaultSecretStorageKeyContent}
                        hasVerifiedOtherDevice={(verifiedDeviceCount ?? 0) > 0}
                      />
                    )}
                    {crypto && verificationStatus === VerificationStatus.Verified && (
                      <BackupRestoreTile
                        crypto={crypto}
                        secretStorageKeyId={defaultSecretStorageKeyId}
                        secretStorageKeyContent={defaultSecretStorageKeyContent}
                      />
                    )}
                  </SequenceCard>
                ) : (
                  <DeviceTilePlaceholder />
                )}
              </Box>
              {devices === undefined && <DevicesPlaceholder />}
              {otherDevices && (
                <OtherDevices
                  devices={otherDevices}
                  refreshDeviceList={refreshDeviceList}
                  showVerification={crossSigningActive}
                />
              )}
              <LocalBackup />
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </SettingsSectionPage>
  );
}
