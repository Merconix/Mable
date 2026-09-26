import { isTauri } from '@tauri-apps/api/core';
import {
  checkPermissions,
  getCurrentPosition,
  requestPermissions,
} from '@tauri-apps/plugin-geolocation';
import { isGeolocationEnabled, isMobileTauri } from './platform';

export type Coordinates = { lat: number; lon: number };

export type GeolocationFailure =
  | 'permissions'
  | 'unavailable'
  // Desktop webviews have no geolocation backend, and the plugin is Android/iOS only.
  | 'unsupported'
  | 'unknown';

export class GeolocationError extends Error {
  readonly reason: GeolocationFailure;

  constructor(reason: GeolocationFailure) {
    super(reason);
    this.reason = reason;
  }
}

const POSITION_OPTIONS = { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 };

const getNativeCoordinates = async (): Promise<Coordinates> => {
  let status = await checkPermissions();
  if (status.location === 'prompt' || status.location === 'prompt-with-rationale') {
    status = await requestPermissions(['location']);
  }
  if (status.location !== 'granted') throw new GeolocationError('permissions');

  const { coords } = await getCurrentPosition(POSITION_OPTIONS);
  return { lat: coords.latitude, lon: coords.longitude };
};

const getWebCoordinates = (): Promise<Coordinates> =>
  new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lon: coords.longitude }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) reject(new GeolocationError('permissions'));
        else if (err.code === err.POSITION_UNAVAILABLE) reject(new GeolocationError('unavailable'));
        else reject(new GeolocationError('unknown'));
      },
      POSITION_OPTIONS
    );
  });

export const getCurrentCoordinates = async (): Promise<Coordinates> => {
  if (!isTauri()) return getWebCoordinates();
  if (!isMobileTauri() || !isGeolocationEnabled()) throw new GeolocationError('unsupported');
  try {
    return await getNativeCoordinates();
  } catch (err) {
    throw err instanceof GeolocationError ? err : new GeolocationError('unknown');
  }
};
