export const BT510 = {
  BLUETOOTH: {
    UART_SERVICE_UUID: '569a1101-b87f-490c-92cb-11ba5ea5167c',
    WRITE_CHARACTERISTIC_UUID: '569a2000-b87f-490c-92cb-11ba5ea5167c',
    READ_CHARACTERISTIC_UUID: '569a2001-b87f-490c-92cb-11ba5ea5167c',
    SCAN_MODE_LOW_LATENCY: 2,
  },
  COMMANDS: {
    BLINK: '{"jsonrpc": "2.0", "method": "ledTest", "params": [200], "id": 2}',
    DOWNLOAD: '*logall',
    INFO: '*info',
    UPDATE_LOG_INTERVAL: '*lint',
    DISABLE_BUTTON: '*bd',
  },
  MANUFACTURER_ID: 228, // 0xE4
  TEMPERATURE_DIVISOR: 10.0,
} as const;
export const BLUE_MAESTRO = {
  BLUETOOTH: {
    UART_SERVICE_UUID: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    READ_CHARACTERISTIC_UUID: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
    WRITE_CHARACTERISTIC_UUID: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
    SCAN_MODE_LOW_LATENCY: 2,
  },
  COMMANDS: {
    BLINK: '*blink',
    DOWNLOAD: '*logall',
    INFO: '*info',
    UPDATE_LOG_INTERVAL: '*lint',
    DISABLE_BUTTON: '*bd',
  },
  MANUFACTURER_ID: 307,
  DELIMITER_A: 11776,
  DELIMITER_B: 11308,
  TEMPERATURE_DIVISOR: 10.0,
} as const;
