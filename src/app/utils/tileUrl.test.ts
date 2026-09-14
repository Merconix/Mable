import { describe, expect, it, vi } from 'vitest';

const hoistedIsTauri = vi.hoisted(() => vi.fn<() => boolean>(() => false));

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: hoistedIsTauri,
  convertFileSrc: (path: string, protocol: string) =>
    `${protocol}://localhost/${encodeURIComponent(path)}`,
}));

const { getTileUrl } = await import('./tileUrl');

describe('getTileUrl', () => {
  it('uses openstreetmap.org directly on web', () => {
    hoistedIsTauri.mockReturnValue(false);
    expect(getTileUrl()).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  });

  it('keeps the leaflet placeholders unencoded behind the native scheme', () => {
    hoistedIsTauri.mockReturnValue(true);
    expect(getTileUrl()).toBe('sable-tiles://localhost/{z}/{x}/{y}.png');
  });
});
