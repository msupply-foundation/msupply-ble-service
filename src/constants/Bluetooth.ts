export enum BT510 {
  BLUETOOTH_UART_SERVICE_UUID = '569a1101-b87f-490c-92cb-11ba5ea5167c',
  BLUETOOTH_WRITE_CHARACTERISTIC_UUID = '569a2000-b87f-490c-92cb-11ba5ea5167c',
  BLUETOOTH_READ_CHARACTERISTIC_UUID = '569a2001-b87f-490c-92cb-11ba5ea5167c',
  BLUETOOTH_SCAN_MODE_LOW_LATENCY = 2,
  COMMANDS_BLINK = '{"jsonrpc": "2.0", "method": "ledTest", "params": [200], "id": 2}',
  COMMANDS_DOWNLOAD = '*logall',
  COMMANDS_INFO = '*info',
  COMMANDS_UPDATE_LOG_INTERVAL = '*lint',
  COMMANDS_DISABLE_BUTTON = '*bd',
  MANUFACTURER_ID = 228, // 0xE4
  TEMPERATURE_DIVISOR = 10.0,
}

export enum BLUE_MAESTRO {
  BLUETOOTH_UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  BLUETOOTH_READ_CHARACTERISTIC_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
  BLUETOOTH_WRITE_CHARACTERISTIC_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
  BLUETOOTH_SCAN_MODE_LOW_LATENCY = 2,
  COMMANDS_BLINK = '*blink',
  COMMANDS_DOWNLOAD = '*logall',
  COMMANDS_INFO = '*info',
  COMMANDS_UPDATE_LOG_INTERVAL = '*lint',
  COMMANDS_DISABLE_BUTTON = '*bd',
  MANUFACTURER_ID = 307,
  DELIMITER_A = 11776,
  DELIMITER_B = 11308,
  TEMPERATURE_DIVISOR = 10.0,
}