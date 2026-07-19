import type { KeyStore } from '../keys/key-store.js';

export const DEVICE_ENROLLMENT_KEY = 'kernel.entitlement.devices';
export const MAX_ENROLLED_DEVICES = 3;

export interface EnrolledDevice {
  deviceId: string;
  enrolledAt: string;
}

export interface DeviceEnrollmentState {
  entitlementId: string;
  devices: EnrolledDevice[];
}

export class DeviceEnrollmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeviceEnrollmentError';
  }
}

async function readEnrollmentState(keyStore: KeyStore): Promise<DeviceEnrollmentState | null> {
  const raw = await keyStore.get(DEVICE_ENROLLMENT_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as DeviceEnrollmentState;
    if (typeof parsed.entitlementId !== 'string' || !Array.isArray(parsed.devices)) {
      return null;
    }
    return {
      entitlementId: parsed.entitlementId,
      devices: parsed.devices.filter(
        (device): device is EnrolledDevice =>
          typeof device?.deviceId === 'string'
          && typeof device?.enrolledAt === 'string',
      ),
    };
  } catch {
    return null;
  }
}

async function writeEnrollmentState(
  keyStore: KeyStore,
  state: DeviceEnrollmentState,
): Promise<void> {
  await keyStore.set(DEVICE_ENROLLMENT_KEY, JSON.stringify(state));
}

export async function clearDeviceEnrollment(keyStore: KeyStore): Promise<void> {
  await keyStore.delete(DEVICE_ENROLLMENT_KEY);
}

export async function getDeviceEnrollmentState(
  keyStore: KeyStore,
): Promise<DeviceEnrollmentState | null> {
  return readEnrollmentState(keyStore);
}

export async function isDeviceEnrolled(
  keyStore: KeyStore,
  entitlementId: string,
  deviceId: string,
): Promise<boolean> {
  const state = await readEnrollmentState(keyStore);
  if (!state || state.entitlementId !== entitlementId) {
    return false;
  }
  return state.devices.some((device) => device.deviceId === deviceId);
}

export async function enrollDevice(
  keyStore: KeyStore,
  entitlementId: string,
  deviceId: string,
  enrolledAt = new Date().toISOString(),
): Promise<DeviceEnrollmentState> {
  let state = await readEnrollmentState(keyStore);

  if (!state || state.entitlementId !== entitlementId) {
    state = {
      entitlementId,
      devices: [{ deviceId, enrolledAt }],
    };
    await writeEnrollmentState(keyStore, state);
    return state;
  }

  if (state.devices.some((device) => device.deviceId === deviceId)) {
    return state;
  }

  if (state.devices.length >= MAX_ENROLLED_DEVICES) {
    throw new DeviceEnrollmentError(
      `Device limit reached (${MAX_ENROLLED_DEVICES}). Transfer or remove a device first.`,
    );
  }

  state = {
    entitlementId,
    devices: [...state.devices, { deviceId, enrolledAt }],
  };
  await writeEnrollmentState(keyStore, state);
  return state;
}

export async function transferDeviceEnrollment(
  keyStore: KeyStore,
  entitlementId: string,
  fromDeviceId: string,
  toDeviceId: string,
  transferredAt = new Date().toISOString(),
): Promise<DeviceEnrollmentState> {
  const state = await readEnrollmentState(keyStore);
  if (!state || state.entitlementId !== entitlementId) {
    throw new DeviceEnrollmentError('No enrollment state for this entitlement');
  }

  const fromIndex = state.devices.findIndex((device) => device.deviceId === fromDeviceId);
  if (fromIndex < 0) {
    throw new DeviceEnrollmentError(`Device "${fromDeviceId}" is not enrolled`);
  }

  if (state.devices.some((device) => device.deviceId === toDeviceId)) {
    throw new DeviceEnrollmentError(`Device "${toDeviceId}" is already enrolled`);
  }

  const nextDevices = [...state.devices];
  nextDevices[fromIndex] = { deviceId: toDeviceId, enrolledAt: transferredAt };
  const nextState = { entitlementId, devices: nextDevices };
  await writeEnrollmentState(keyStore, nextState);
  return nextState;
}

export async function removeEnrolledDevice(
  keyStore: KeyStore,
  entitlementId: string,
  deviceId: string,
): Promise<DeviceEnrollmentState | null> {
  const state = await readEnrollmentState(keyStore);
  if (!state || state.entitlementId !== entitlementId) {
    return null;
  }

  const nextDevices = state.devices.filter((device) => device.deviceId !== deviceId);
  if (nextDevices.length === state.devices.length) {
    return state;
  }

  if (nextDevices.length === 0) {
    await clearDeviceEnrollment(keyStore);
    return null;
  }

  const nextState = { entitlementId, devices: nextDevices };
  await writeEnrollmentState(keyStore, nextState);
  return nextState;
}
