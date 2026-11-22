let device;
const UUID = { hrService: 'heart_rate', hr: 'heart_rate_measurement', battService: 'battery_service', batt: 'battery_level', info: 'device_information', model: 'model_number_string', fw: 'firmware_revision_string', tempService: 'health_thermometer', temp: 'temperature_measurement' };
const text = value => new TextDecoder().decode(value.buffer).replace(/\0/g, '').trim();
function parseTemperature(value) {
  // Bluetooth Health Thermometer uses IEEE-11073 FLOAT: mantissa (24-bit signed)
  // followed by exponent (8-bit signed), in little-endian order.
  if (value.byteLength < 5) return null;
  let mantissa = value.getUint8(1) | (value.getUint8(2) << 8) | (value.getUint8(3) << 16);
  if (mantissa & 0x800000) mantissa |= 0xff000000;
  let exponent = value.getInt8(4);
  return mantissa * (10 ** exponent);
}
export async function connectBLE(onData) {
  if (!navigator.bluetooth) throw new Error('Web Bluetooth ni na voljo. Odpri aplikacijo v Chrome/Edge prek HTTPS ali localhost.');
  device = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate', 'battery_service', 'device_information', 'health_thermometer'] }] });
  device.addEventListener('gattserverdisconnected', () => onData({ type: 'status', connected: false, text: 'Povezava prekinjena' }));
  const server = await device.gatt.connect();
  onData({ type: 'status', connected: true, text: `Povezano: ${device.name || 'BLE naprava'}`, name: device.name || 'BLE naprava' });
  try {
    const service = await server.getPrimaryService(UUID.hrService); const ch = await service.getCharacteristic(UUID.hr);
    await ch.startNotifications(); ch.addEventListener('characteristicvaluechanged', e => { const v = e.target.value; const hr = (v.getUint8(0) & 1) ? v.getUint16(1, true) : v.getUint8(1); onData({ type: 'hr', value: hr }); });
  } catch { onData({ type: 'info', text: 'Meritev srčnega utripa ni na voljo.' }); }
  try { const service = await server.getPrimaryService(UUID.battService); const ch = await service.getCharacteristic(UUID.batt); const emit = v => onData({ type: 'battery', value: v.getUint8(0) }); emit(await ch.readValue()); await ch.startNotifications(); ch.addEventListener('characteristicvaluechanged', e => emit(e.target.value)); } catch { onData({ type: 'info', text: 'Baterija ni na voljo.' }); }
  try { const service = await server.getPrimaryService(UUID.info); for (const [key, uuid] of [['model', UUID.model], ['firmware', UUID.fw]]) { try { onData({ type: key, value: text(await (await service.getCharacteristic(uuid)).readValue()) }); } catch {} } } catch {}
  try { const service = await server.getPrimaryService(UUID.tempService); const ch = await service.getCharacteristic(UUID.temp); await ch.startNotifications(); ch.addEventListener('characteristicvaluechanged', e => { const value = parseTemperature(e.target.value); if (value != null) onData({ type: 'temp', value }); }); } catch { onData({ type: 'info', text: 'Temperatura ni na voljo.' }); }
  return device;
}
export function disconnectBLE() { if (device?.gatt?.connected) device.gatt.disconnect(); }
