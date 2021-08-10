import { BTUtilService } from '../BTUtilService';

import { Buffer } from 'buffer';
import { BLUE_MAESTRO, BT510 } from '../index';
import { MacAddress } from '../types/common';
import {
  Characteristic,
  ScanOptions,
  ScanMode,
  BluetoothDevice,
  InfoLog,
  MonitorCharacteristicCallback,
  MonitorCharacteristicParser,
  ScanCallback,
  SensorLog,
  LogLevel,
  Device,
  BleError,
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

  connectToDevice = async (macAddress: MacAddress): Promise<BluetoothDevice> => {
    return this.manager.connectToDevice(macAddress);
  };

  connectAndDiscoverServices = async (macAddress: MacAddress): Promise<Device | null> => {
    if (await this.manager.isDeviceConnected(macAddress)) {
      await this.manager.cancelDeviceConnection(macAddress);
    }
    await this.connectToDevice(macAddress);

    const device = await this.manager.discoverAllServicesAndCharacteristicsForDevice(macAddress);
    console.log(
      `BleService connectAndDiscoverServices, device2, id ${device?.id}, name ${device?.name}, mfgData ${device?.manufacturerData}`
    );
    return device;
  };

  stopScan = (): void => {
    this.manager.stopDeviceScan();
  };

  deviceConstants = (device: Device | null): any => {
    if (device?.name === 'BT510') {
      // Laird doesn't include Manufacurer Data in connect response.
      return BT510;
    } else {
      return BLUE_MAESTRO;
    }
    //    return null;
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

  writeCharacteristic = async (
    macAddress: MacAddress,
    device: Device | null,
    command: string
  ): Promise<Characteristic> => {
    const btConsts = this.deviceConstants(device);
    if (!btConsts) {
      throw new Error(`BleService Can't write to unknown device`);
    }

    command = this.utils.base64FromString(command);

    console.log(`BleService Writing to ${btConsts?.BLUETOOTH.UART_SERVICE_UUID}`);
    return this.manager.writeCharacteristicWithoutResponseForDevice(
      macAddress,
      btConsts.BLUETOOTH.UART_SERVICE_UUID,
      btConsts.BLUETOOTH.READ_CHARACTERISTIC_UUID,
      command
    );
  };

  monitorCharacteristic = (
    macAddress: MacAddress,
    device: Device | null,
    callback: MonitorCharacteristicCallback<boolean | SensorLog[] | InfoLog>
  ): Promise<boolean | SensorLog[] | InfoLog> => {
    const btConsts = this.deviceConstants(device);
    if (!btConsts) {
      throw new Error(`BleService Can't monitor from unknown device`);
    }
    console.log(`BleService Monitoring from ${btConsts.BLUETOOTH.WRITE_CHARACTERISTIC_UUID}`);
    return new Promise((resolve, reject) => {
      this.manager.monitorCharacteristicForDevice(
        macAddress,
        btConsts.BLUETOOTH.UART_SERVICE_UUID,
        btConsts.BLUETOOTH.WRITE_CHARACTERISTIC_UUID,
        (_, result) => {
          callback(result, resolve, reject);
        }
      );
    });
  };

  writeAndMonitor = async (
    macAddress: MacAddress,
    device: Device | null,
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

    const monitor = this.monitorCharacteristic(macAddress, device, monitoringCallback);
    await this.writeCharacteristic(macAddress, device, command);

    return monitor;
  };

  writeWithSingleResponse = async (
    macAddress: MacAddress,
    device: Device | null,
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
    const monitor = this.monitorCharacteristic(macAddress, device, monitorCharacteristicCallback);
    await this.writeCharacteristic(macAddress, device, command);

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
      macAddress,
      device,
      BLUE_MAESTRO.COMMANDS.DOWNLOAD,
      monitorCallback
    )) as SensorLog[];

    return result;
  };

  updateLogInterval = async (macAddress: MacAddress, logInterval: number): Promise<boolean> => {
    const device = await this.connectAndDiscoverServices(macAddress);
    const result = await this.writeWithSingleResponse(
      macAddress,
      device,
      `${BLUE_MAESTRO.COMMANDS.UPDATE_LOG_INTERVAL}${logInterval}`,
      data => !!this.utils.stringFromBase64(data).match(/interval/i)
    );
    return !!result;
  };

  blink = async (macAddress: MacAddress): Promise<boolean> => {
    const device = await this.connectAndDiscoverServices(macAddress);
    const btConsts = this.deviceConstants(device);
    console.log(`BleService Blinking ${btConsts.COMMANDS.BLINK}`);
    const result = (await this.writeWithSingleResponse(
      macAddress,
      device,
      btConsts.COMMANDS.BLINK,
      data => {
        const result = this.utils.stringFromBase64(data);
        console.log(`BleService data returned from blink write: ${result}`);
        return !!result.match(/ok/i);
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
      macAddress,
      device,
      BLUE_MAESTRO.COMMANDS.INFO,
      monitorResultCallback
    )) as InfoLog;

    return result;
  };

  toggleButton = async (macAddress: MacAddress): Promise<boolean> => {
    const device = await this.connectAndDiscoverServices(macAddress);
    const result = (await this.writeWithSingleResponse(
      macAddress,
      device,
      BLUE_MAESTRO.COMMANDS.DISABLE_BUTTON,
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
