import type { FormEventHandler } from 'react';
import { useCallback } from 'react';
import { Box, color, Text } from 'folds';
import { Button } from '$components/button';
import { PasswordInput } from '$components/password-input';
import { ConfirmPasswordMatch } from '$components/ConfirmPasswordMatch';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { useAlive } from '$hooks/useAlive';
import { encryptMegolmKeyFile, type FriendlyError } from '$utils/MegolmExportEncryption';
import { saveFileToDevice } from '$utils/download';

type ExportError = Error | FriendlyError;

const errorMessage = (error: ExportError): string =>
  'friendlyText' in error ? error.friendlyText : error.message;

type LegacyKeyExportProps = {
  exporter: () => Promise<string>;
};

export function LegacyKeyExport({ exporter }: LegacyKeyExportProps) {
  const alive = useAlive();

  const [exportState, exportKeys] = useAsyncCallback<void, ExportError, [string]>(
    useCallback(
      async (password) => {
        const keysJSON = await exporter();
        const blob = new Blob([await encryptMegolmKeyFile(keysJSON, password)], {
          type: 'text/plain;charset=us-ascii',
        });
        const outcome = await saveFileToDevice(blob, 'sable-keys.txt');
        if (outcome === 'failed') throw new Error('The key file could not be saved.');
      },
      [exporter]
    )
  );

  const exporting = exportState.status === AsyncStatus.Loading;

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    if (exporting) return;

    const { passwordInput, confirmPasswordInput } = evt.target as HTMLFormElement & {
      passwordInput: HTMLInputElement;
      confirmPasswordInput: HTMLInputElement;
    };
    if (passwordInput.value !== confirmPasswordInput.value) return;

    exportKeys(passwordInput.value).then(() => {
      if (alive()) {
        passwordInput.value = '';
        confirmPasswordInput.value = '';
      }
    });
  };

  return (
    <Box as="form" onSubmit={handleSubmit} direction="Column" gap="200">
      <Text size="T200">
        Export this installation&apos;s message keys to a file first if you have no recovery key and
        no other signed-in device. You can import it again after signing back in.
      </Text>
      <Box gap="200" alignItems="End">
        <ConfirmPasswordMatch initialValue>
          {(match, doMatch, passRef, confPassRef) => (
            <>
              <Box grow="Yes" direction="Column" gap="100">
                <Text size="L400">Password</Text>
                <PasswordInput
                  ref={passRef}
                  name="passwordInput"
                  size="400"
                  variant="Secondary"
                  radii="300"
                  required
                  onChange={doMatch}
                  readOnly={exporting}
                />
              </Box>
              <Box grow="Yes" direction="Column" gap="100">
                <Text size="L400">Confirm Password</Text>
                <PasswordInput
                  ref={confPassRef}
                  style={{ color: match ? undefined : color.Critical.Main }}
                  name="confirmPasswordInput"
                  size="400"
                  variant="Secondary"
                  radii="300"
                  required
                  onChange={doMatch}
                  readOnly={exporting}
                />
              </Box>
            </>
          )}
        </ConfirmPasswordMatch>
      </Box>
      <Button type="submit" variant="Secondary" fill="Soft" outlined disabled={exporting}>
        <Text as="span" size="B400">
          {exporting ? 'Exporting…' : 'Export encryption keys'}
        </Text>
      </Button>
      {exportState.status === AsyncStatus.Error && (
        <Text size="T200" style={{ color: color.Critical.Main }}>
          {errorMessage(exportState.error)}
        </Text>
      )}
      {exportState.status === AsyncStatus.Success && (
        <Text size="T200" style={{ color: color.Success.Main }}>
          Keys exported.
        </Text>
      )}
    </Box>
  );
}
