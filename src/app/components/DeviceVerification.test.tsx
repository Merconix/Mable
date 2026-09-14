import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VerificationRequest } from '$types/matrix-sdk';
import { VerificationPhase } from '$types/matrix-sdk';
import { DeviceVerification } from './DeviceVerification';

vi.mock('$hooks/useMatrixClient', () => ({
  useMatrixClient: () => ({ getSafeUserId: () => '@me:example.org' }),
}));

vi.mock('$components/modal-overlay/ModalOverlay', () => ({
  ModalOverlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const sasCallbacks = {
  sas: { emoji: [['🐶', 'Dog']] as [string, string][] },
  confirm: vi.fn<() => Promise<void>>(),
  mismatch: vi.fn<() => void>(),
  cancel: vi.fn<() => void>(),
};

const verificationRequest = (verify: () => Promise<void>) => ({
  phase: VerificationPhase.Started,
  initiatedByMe: true,
  verifier: {
    verify,
    getShowSasCallbacks: () => sasCallbacks,
    on: vi.fn<() => void>(),
    removeListener: vi.fn<() => void>(),
  },
  cancel: vi.fn<() => Promise<void>>(),
  accept: vi.fn<() => Promise<void>>(),
  startVerification: vi.fn<() => Promise<void>>(),
  on: vi.fn<() => void>(),
  removeListener: vi.fn<() => void>(),
});

const renderDialog = (request: ReturnType<typeof verificationRequest>) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DeviceVerification
        request={request as unknown as VerificationRequest}
        onExit={vi.fn<() => void>()}
      />
    </QueryClientProvider>
  );

describe('DeviceVerification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports success once the emoji matched, while the request still reads Started', async () => {
    renderDialog(verificationRequest(() => Promise.resolve()));

    expect(await screen.findByText('Your device is verified.')).toBeInTheDocument();
  });

  it('does not cancel a verification that already succeeded', async () => {
    const request = verificationRequest(() => Promise.resolve());

    renderDialog(request);
    await screen.findByText('Your device is verified.');

    screen.getByRole('button', { name: /Okay/i }).click();

    await waitFor(() => expect(request.cancel).not.toHaveBeenCalled());
  });

  it('keeps showing the emoji while the verifier has not resolved', async () => {
    renderDialog(verificationRequest(() => new Promise<void>(() => undefined)));

    expect(await screen.findByText(/Confirm the emoji below/)).toBeInTheDocument();
    expect(screen.queryByText('Your device is verified.')).toBeNull();
  });
});
