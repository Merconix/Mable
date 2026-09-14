import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BatteryOptimizationSetting } from './BatteryOptimization';

const { isIgnoringBatteryOptimizations, requestIgnoreBatteryOptimizations } = vi.hoisted(() => ({
  isIgnoringBatteryOptimizations: vi.fn<() => Promise<boolean | null>>(),
  requestIgnoreBatteryOptimizations: vi.fn<() => Promise<void>>(),
}));

vi.mock('./UnifiedPushNotifications', () => ({
  isIgnoringBatteryOptimizations,
  requestIgnoreBatteryOptimizations,
}));

describe('BatteryOptimizationSetting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestIgnoreBatteryOptimizations.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prompts when the embedded distributor runs without an exemption', async () => {
    isIgnoringBatteryOptimizations.mockResolvedValue(false);

    render(<BatteryOptimizationSetting active />);

    const allow = await screen.findByRole('button', { name: /allow/i });
    await userEvent.click(allow);

    expect(requestIgnoreBatteryOptimizations).toHaveBeenCalledOnce();
  });

  it('stays hidden once the exemption is granted', async () => {
    isIgnoringBatteryOptimizations.mockResolvedValue(true);

    render(<BatteryOptimizationSetting active />);

    await waitFor(() => expect(isIgnoringBatteryOptimizations).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /allow/i })).not.toBeInTheDocument();
  });

  it('stays hidden for other distributors', async () => {
    render(<BatteryOptimizationSetting active={false} />);

    await Promise.resolve();
    expect(isIgnoringBatteryOptimizations).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /allow/i })).not.toBeInTheDocument();
  });

  it('re-checks when the user comes back from the system dialog', async () => {
    isIgnoringBatteryOptimizations.mockResolvedValue(false);

    render(<BatteryOptimizationSetting active />);
    await screen.findByRole('button', { name: /allow/i });

    isIgnoringBatteryOptimizations.mockResolvedValue(true);
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /allow/i })).not.toBeInTheDocument()
    );
  });
});
