import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReceiveSelfDeviceVerification } from './DeviceVerification';

const getVerificationRequestsToDeviceInProgress = vi.hoisted(() =>
  vi.fn<(userId: string) => unknown[]>()
);
const listeners = vi.hoisted(() => new Map<string, (request: unknown) => void>());
const matrixClient = vi.hoisted(() => ({
  clientRunning: true,
  getSafeUserId: () => '@me:example.org',
  getCrypto: () => ({ getVerificationRequestsToDeviceInProgress }),
  on: (event: string, handler: (request: unknown) => void) => listeners.set(event, handler),
  removeListener: (event: string) => listeners.delete(event),
}));
vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => matrixClient,
}));

vi.mock('$components/modal-overlay/ModalOverlay', () => ({
  ModalOverlay: ({
    children,
    deactivateCloses,
  }: {
    children: React.ReactNode;
    deactivateCloses?: boolean;
  }) => <div data-deactivate-closes={String(deactivateCloses)}>{children}</div>,
}));

const pendingRequest = {
  isSelfVerification: true,
  initiatedByMe: false,
  pending: true,
  phase: 1,
  on: vi.fn<() => void>(),
  removeListener: vi.fn<() => void>(),
};

const renderReceiver = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ReceiveSelfDeviceVerification />
    </QueryClientProvider>
  );

describe('ReceiveSelfDeviceVerification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVerificationRequestsToDeviceInProgress.mockReset();
    getVerificationRequestsToDeviceInProgress.mockReturnValue([]);
    matrixClient.clientRunning = true;
    listeners.clear();
  });

  it('shows a pending self-verification request that arrived before mount', async () => {
    getVerificationRequestsToDeviceInProgress.mockReturnValue([pendingRequest]);

    renderReceiver();

    await waitFor(() => expect(screen.getByText('Device Verification')).toBeInTheDocument());
  });

  it('shows an incoming self-verification request from the SDK event', async () => {
    renderReceiver();
    listeners.get('crypto.verificationRequestReceived')?.(pendingRequest);

    await waitFor(() => expect(screen.getByText('Device Verification')).toBeInTheDocument());
  });

  it('does not treat unmounting as the user cancelling', async () => {
    const cancel = vi.fn<() => Promise<void>>(async () => undefined);

    const { unmount } = renderReceiver();
    listeners.get('crypto.verificationRequestReceived')?.({ ...pendingRequest, cancel });
    await waitFor(() => expect(screen.getByText('Device Verification')).toBeInTheDocument());
    expect(
      screen.getByText('Device Verification').closest('[data-deactivate-closes]')
    ).toHaveAttribute('data-deactivate-closes', 'false');

    unmount();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('ignores a request this device started', async () => {
    renderReceiver();
    listeners.get('crypto.verificationRequestReceived')?.({
      ...pendingRequest,
      initiatedByMe: true,
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(screen.queryByText('Device Verification')).toBeNull();
  });

  it('does not query a disposed crypto engine', () => {
    matrixClient.clientRunning = false;
    getVerificationRequestsToDeviceInProgress.mockImplementation(() => {
      throw new Error('null pointer passed to rust');
    });

    renderReceiver();

    expect(getVerificationRequestsToDeviceInProgress).not.toHaveBeenCalled();
  });

  it('does not poll after the client stops', () => {
    vi.useFakeTimers();

    renderReceiver();
    expect(getVerificationRequestsToDeviceInProgress).toHaveBeenCalledTimes(1);

    matrixClient.clientRunning = false;
    getVerificationRequestsToDeviceInProgress.mockImplementation(() => {
      throw new Error('null pointer passed to rust');
    });
    vi.advanceTimersByTime(6000);

    expect(getVerificationRequestsToDeviceInProgress).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('ignores a completed request found in progress', async () => {
    getVerificationRequestsToDeviceInProgress.mockReturnValue([
      { ...pendingRequest, pending: false },
    ]);

    renderReceiver();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText('Device Verification')).toBeNull();
  });
});
