/**
 * IoT sensor helpers. Readings arrive already calibrated: the Arduino bridge
 * (hardware/telemetry_bridge.py) applies the room-temp → cooler offset before
 * posting, so demo data, the simulator and real hardware all store real
 * cooler temperatures and the dashboard displays them as-is.
 */

export type SensorStatus = 'ok' | 'warning' | 'critical';

export interface SensorReading {
  value: number;
  unit: string | null;
  ts_datetime: string;
  age_seconds: number;
  /** "simulator" in demo mode, "device" for real hardware */
  source?: 'simulator' | 'device';
}

export interface LatestTelemetry {
  store_id: number;
  store_name: string;
  sensors: Record<string, SensorReading>;
  total_sensors: number;
}

const RANGES: Record<string, { min: number; max: number }> = {
  cooler_temp_c: { min: 1, max: 4 },
  cooler_temp_f: { min: 34, max: 40 },
  cooler_humidity_pct: { min: 60, max: 75 },
  freezer_temp_c: { min: -20, max: -15 },
};

export function getSensorStatus(sensor: string, value: number): SensorStatus {
  const range = RANGES[sensor];
  if (!range) return 'ok';
  // Critical is 10% beyond either bound. Using |bound| keeps this correct for
  // below-zero ranges (freezer), where min * 0.9 would land inside the range.
  const lowCritical = range.min - Math.abs(range.min) * 0.1;
  const highCritical = range.max + Math.abs(range.max) * 0.1;
  if (value < lowCritical || value > highCritical) return 'critical';
  if (value < range.min || value > range.max) return 'warning';
  return 'ok';
}

function normalizeUnit(sensor: string, unit: string | null): 'celsius' | 'fahrenheit' | 'pct' | string | null {
  const u = unit?.trim().toLowerCase().replace('°', '') ?? null;
  if (u === 'c' || u === 'celsius') return 'celsius';
  if (u === 'f' || u === 'fahrenheit') return 'fahrenheit';
  if (u === '%' || u === 'pct' || u === 'percent') return 'pct';
  if (!u && sensor.endsWith('_f')) return 'fahrenheit';
  if (!u && sensor.includes('temp')) return 'celsius';
  return u;
}

export function formatSensorValue(sensor: string, value: number, unit: string | null): string {
  const u = normalizeUnit(sensor, unit);
  if (u === 'fahrenheit') return `${value.toFixed(1)}°F`;
  if (u === 'celsius') return `${((value * 9) / 5 + 32).toFixed(1)}°F`;
  if (u === 'pct') return `${value.toFixed(1)}%`;
  return u ? `${value.toFixed(1)} ${u}` : value.toFixed(1);
}

const SENSOR_ORDER = ['cooler_temp_c', 'freezer_temp_c', 'cooler_humidity_pct', 'ambient_temp_c'];

/**
 * Sensors to show as tiles: known sensors first, and a Fahrenheit duplicate
 * (e.g. cooler_temp_f) dropped when its Celsius twin exists, since the bridge
 * posts both and every temperature is displayed in °F anyway.
 */
export function visibleSensors<T>(sensors: Record<string, T>, max = 4): [string, T][] {
  const entries = Object.entries(sensors).filter(([name]) => {
    const twin = name.endsWith('_f') ? `${name.slice(0, -2)}_c` : null;
    return !(twin && twin in sensors);
  });
  const rank = (name: string) => {
    const i = SENSOR_ORDER.indexOf(name);
    return i === -1 ? SENSOR_ORDER.length : i;
  };
  return entries.sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b)).slice(0, max);
}

export function formatSensorName(sensor: string): string {
  return sensor
    .replace(/_(c|f|pct)$/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function sensorKind(sensor: string): 'freezer' | 'humidity' | 'temperature' | 'other' {
  if (sensor.includes('freezer')) return 'freezer';
  if (sensor.includes('humidity')) return 'humidity';
  if (sensor.includes('temp')) return 'temperature';
  return 'other';
}

export function formatAge(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
