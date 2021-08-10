import { BTUtilService } from '../BTUtilService';

import { Buffer } from 'buffer';
import { BLUE_MAESTRO, BT510 } from '../index';
import { MacAddress } from '../types/common';
import {
  Characteristic,
  ScanOptions,
  ScanMode,
  TypedDevice,
  InfoLog,
  MonitorCharacteristicCallback,
  MonitorCharacteristicParser,
  ScanCallback,
  SensorLog,
  LogLevel,
  Device,
  BleError,
  DeviceType,
} from './types';
import { BluetoothManager } from './BleManager';

export class BleService {
  manager: BluetoothManager;
  utils: BTUtilService;

  constructor(manager: BluetoothManager, utils: BTUtilService) {
    this.manager = manager;
    manager.setLogLevel(LogLevel.Verbose);
    // In the future we may want to use our own utils,
    //  not the ones passed in from the app.
    //this.utils = new BTUtilService();
    this.utils = utils;
  }

  deviceConstants = (device: Pick<Device, 'id' | 'name'> | null): DeviceType => {
    if (device?.name) {
      if (device.name === 'BT510') {
        // Laird doesn't include Manufacurer Data in connect response.
        return BT510;
      } else {
        // Blue Maestro has part of the mac address as its name.
        // We could check this but...
        return BLUE_MAESTRO;
      }
    }
    throw new Error('device or name is null');
  };

  connectToDevice = async (macAddress: MacAddress): Promise<TypedDevice> => {
    const device = await this.manager.connectToDevice(macAddress);
    console.log(`BleService connectToDevice, device, id ${device?.id}, name ${device?.name}`);
    return { id: device.id, deviceType: this.deviceConstants(device) };
  };

  connectAndDiscoverServices = async (macAddress: MacAddress): Promise<TypedDevice> => {
    if (await this.manager.isDeviceConnected(macAddress)) {
      await this.manager.cancelDeviceConnection(macAddress);
    }
    const device = await this.connectToDevice(macAddress);

    await this.manager.discoverAllServicesAndCharacteristicsForDevice(macAddress);
    return device;
  };

  stopScan = (): void => {
    this.manager.stopDeviceScan();
  };

  scanForSensors = (callback: ScanCallback): void => {
    const scanOptions: ScanOptions = { scanMode: ScanMode.LowLatency };
    const filteredCallback: ScanCallback = (err: BleError | null, device: Device | null): void => {
      if (err) {
        console.log('BleService Scan Error:', JSON.stringify(err));
      }

      if (device?.manufacturerData) {
        const mfgId = Buffer.from(device.manufacturerData, 'base64').readInt16LE(0);
        if (mfgId === BLUE_MAESTRO.MANUFACTURER_ID || mfgId === BT510.MANUFACTURER_ID) {
          // console.log(
          //   `BleService Found device: ${device.id}, ${device.name}, ${mfgId}`
          // );
          callback(err, device);
        }
      }
    };
    this.manager.startDeviceScan(null, scanOptions, filteredCallback);
    console.log('BleService Started scan');
    this.manager.logLevel().then(value => console.log(`Log Level ${value}`));
  };

  writeCharacteristic = async (device: TypedDevice, command: string): Promise<Characteristic> => {
    console.log(`BleService Writing to ${device.deviceType.BLUETOOTH_UART_SERVICE_UUID}`);
    return this.manager.writeCharacteristicWithoutResponseForDevice(
      device.id,
      device.deviceType.BLUETOOTH_UART_SERVICE_UUID,
      device.deviceType.BLUETOOTH_READ_CHARACTERISTIC_UUID,
      this.utils.base64FromString(command)
    );
  };

  monitorCharacteristic = (
    device: TypedDevice,
    callback: MonitorCharacteristicCallback<boolean | SensorLog[] | InfoLog>
  ): Promise<boolean | SensorLog[] | InfoLog> => {
    console.log(
      `BleService Monitoring from ${device.deviceType.BLUETOOTH_WRITE_CHARACTERISTIC_UUID}`
    );
    return new Promise((resolve, reject) => {
      this.manager.monitorCharacteristicForDevice(
        device.id,
        device.deviceType.BLUETOOTH_UART_SERVICE_UUID,
        device.deviceType.BLUETOOTH_WRITE_CHARACTERISTIC_UUID,
        (_, result) => {
          callback(result, resolve, reject);
        }
      );
    });
  };

  writeAndMonitor = async (
    device: TypedDevice,
    command: string,
    parser: MonitorCharacteristicParser<string[], SensorLog[] | InfoLog>
  ): Promise<boolean | InfoLog | SensorLog[]> => {
    const data: string[] = [];

    const monitoringCallback: MonitorCharacteristicCallback<SensorLog[] | InfoLog> = (
      result,
      resolve,
      reject
    ) => {
      if (result?.value) data.push(result.value);
      else {
        try {
          resolve(parser(data));
        } catch (e) {
          reject(new Error(`Parsing failed: ${e.message}`));
        }
      }
    };

    const monitor = this.monitorCharacteristic(device, monitoringCallback);
    await this.writeCharacteristic(device, command);

    return monitor;
  };

  writeWithSingleResponse = async (
    device: TypedDevice,
    command: string,
    parser: MonitorCharacteristicParser<string, boolean>
  ): Promise<boolean | InfoLog | SensorLog[]> => {
    const monitorCharacteristicCallback: MonitorCharacteristicCallback<boolean> = (
      result,
      resolve,
      reject
    ) => {
      if (result?.value) {
        try {
          resolve(parser(result.value));
        } catch (e) {
          reject(new Error(`Parsing failed: ${e.message}`));
        }
      } else reject(new Error(`Command Failed`));
    };
    console.log(`BleService writeWithSingleResponse: ${command}`);
    const monitor = this.monitorCharacteristic(device, monitorCharacteristicCallback);
    await this.writeCharacteristic(device, command);

    return monitor;
  };

  downloadLogs = async (macAddress: MacAddress): Promise<SensorLog[]> => {
    const device = await this.connectAndDiscoverServices(macAddress);

    const monitorCallback: MonitorCharacteristicParser<string[], SensorLog[]> = (
      data: string[]
    ) => {
      const buffer = Buffer.concat(data.slice(1).map(datum => this.utils.bufferFromBase64(datum)));

      const ind = buffer.findIndex(
        (_, i) =>
          (i % 2 === 0 && buffer.readInt16BE(i) === BLUE_MAESTRO.DELIMITER_A) ||
          buffer.readInt16BE(i) === BLUE_MAESTRO.DELIMITER_B
      );

      return (buffer.slice(0, ind) as Buffer).reduce((acc: SensorLog[], _, index) => {
        if (index % 2 !== 0) return acc;
        return [
          ...acc,
          {
            temperature: buffer.readInt16BE(index) / BLUE_MAESTRO.TEMPERATURE_DIVISOR,
          },
        ];
      }, []);
    };

    const result = (await this.writeAndMonitor(
      device,
      device.deviceType.COMMAND_DOWNLOAD,
      monitorCallback
    )) as SensorLog[];

    return result;
  };

  updateLogInterval = async (macAddress: MacAddress, logInterval: number): Promise<boolean> => {
    const device = await this.connectAndDiscoverServices(macAddress);
    const result = await this.writeWithSingleResponse(
      device,
      `${device.deviceType.COMMAND_UPDATE_LOG_INTERVAL}${logInterval}`,
      data => !!this.utils.stringFromBase64(data).match(/interval/i)
    );
    return !!result;
  };

  blink = async (macAddress: MacAddress): Promise<boolean> => {
    const device = await this.connectAndDiscoverServices(macAddress);
    console.log(`BleService Blinking ${device.deviceType.COMMAND_BLINK}`);
    const result = (await this.writeWithSingleResponse(
      device,
      device.deviceType.COMMAND_BLINK,
      data => {
        const answer = this.utils.stringFromBase64(data);
        console.log(`BleService data returned from blink write: ${result}`);
        return !!answer.match(/ok/i);
      }
    )) as boolean;

    return result;
  };

  getInfo = async (macAddress: MacAddress): Promise<InfoLog> => {
    const device = await this.connectAndDiscoverServices(macAddress);

    const monitorResultCallback: MonitorCharacteristicParser<string[], InfoLog> = data => {
      const parsedBase64 = data.map(this.utils.stringFromBase64);
      const defaultInfoLog: InfoLog = { batteryLevel: null, isDisabled: true };

      const parsedBatteryLevel = (info: string): number | null => {
        const batteryLevelStringOrNull = info.match(/Batt lvl: [0-9]{1,3}/);

        if (!batteryLevelStringOrNull) return batteryLevelStringOrNull;

        const batteryLevel = Number(batteryLevelStringOrNull[0].match(/[0-9]{1,3}/));

        return Number.isNaN(batteryLevel)
          ? null
          : this.utils.normaliseNumber(batteryLevel, [70, 100]);
      };

      const parsedIsDisabled = (info: string): boolean => !!info.match(/Btn on\/off: 1/);

      return parsedBase64.reduce((acc, info) => {
        const isDisabled = parsedIsDisabled(info);
        const batteryLevel = parsedBatteryLevel(info);

        if (isDisabled) return { ...acc, isDisabled };
        if (batteryLevel) return { ...acc, batteryLevel };

        return acc;
      }, defaultInfoLog);
    };

    const result: InfoLog = (await this.writeAndMonitor(
      device,
      device.deviceType.COMMAND_INFO,
      monitorResultCallback
    )) as InfoLog;

    return result;
  };

  toggleButton = async (macAddress: MacAddress): Promise<boolean> => {
    const device = await this.connectAndDiscoverServices(macAddress);
    const result = (await this.writeWithSingleResponse(
      device,
      device.deviceType.COMMAND_DISABLE_BUTTON,
      data => {
        return !!this.utils.stringFromBase64(data).match(/ok/i);
      }
    )) as boolean;
    return result;
  };

  getInfoWithRetries = async (
    macAddress: MacAddress,
    retriesLeft: number,
    error: Error | null
  ): Promise<InfoLog> => {
    if (!retriesLeft) throw error;

    return this.getInfo(macAddress).catch(err =>
      this.getInfoWithRetries(macAddress, retriesLeft - 1, err)
    );
  };

  toggleButtonWithRetries = async (
    macAddress: MacAddress,
    retriesLeft: number,
    error: Error | null
  ): Promise<boolean> => {
    if (!retriesLeft) throw error;

    return this.toggleButton(macAddress).catch(err =>
      this.toggleButtonWithRetries(macAddress, retriesLeft - 1, err)
    );
  };

  downloadLogsWithRetries = async (
    macAddress: MacAddress,
    retriesLeft: number,
    error: Error | null
  ): Promise<SensorLog[]> => {
    if (!retriesLeft) throw error;

    return this.downloadLogs(macAddress).catch(err =>
      this.downloadLogsWithRetries(macAddress, retriesLeft - 1, err)
    );
  };

  blinkWithRetries = async (
    macAddress: MacAddress,
    retriesLeft: number,
    error: Error | null
  ): Promise<boolean> => {
    if (!retriesLeft) throw error;

    return this.blink(macAddress).catch(err =>
      this.blinkWithRetries(macAddress, retriesLeft - 1, err)
    );
  };

  updateLogIntervalWithRetries = async (
    macAddress: MacAddress,
    logInterval: number,
    retriesLeft: number,
    error: Error | null
  ): Promise<boolean> => {
    if (!retriesLeft) throw error;

    return this.updateLogInterval(macAddress, logInterval).catch(err =>
      this.updateLogIntervalWithRetries(macAddress, logInterval, retriesLeft - 1, err)
    );
  };
}
