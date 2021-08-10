import { MacAddress } from '../types/common';
import {
  BleManager as BlePlxManager,
  Subscription,
  Characteristic,
  BleError,
  Device,
  ScanOptions,
  LogLevel,
} from 'react-native-ble-plx';

export type BleDevice = Pick<Device, 'id' | 'name'>;

export declare class BluetoothManager {
  setLogLevel(logLevel: LogLevel): void;
  logLevel(): Promise<LogLevel>;
  connectToDevice(macAddress: MacAddress): Promise<BleDevice>;
  isDeviceConnected(macAddress: MacAddress): Promise<boolean>;
  cancelDeviceConnection(macAddress: MacAddress): Promise<BleDevice>;
  discoverAllServicesAndCharacteristicsForDevice(macAddress: MacAddress): Promise<BleDevice>;
  stopDeviceScan(): void;
  startDeviceScan(
    UUIDs: string[] | null,
    options: ScanOptions | null,
    listener: (error: BleError | null, scannedDevice: Device | null) => void
  ): void;
  writeCharacteristicWithoutResponseForDevice(
    deviceIdentifier: string,
    serviceUUID: string,
    characteristicUUID: string,
    base64Value: string,
    transactionId?: string
  ): Promise<Characteristic>;
  monitorCharacteristicForDevice(
    deviceIdentifier: string,
    serviceUUID: string,
    characteristicUUID: string,
    listener: (error: BleError | null, characteristic: Characteristic | null) => void,
    transactionId?: string
  ): Subscription;
}

export const BleManager = BlePlxManager as unknown as typeof BluetoothManager;