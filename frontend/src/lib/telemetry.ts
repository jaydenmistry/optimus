/**
 * IoT sensor helpers. The calibration and thresholds are unchanged from the
 * original overview page; they were only moved here.
 */

export type SensorStatus = 'ok' | 'warning' | 'critical';

export interface SensorReading {
  value: number;
  unit: string | null;
  ts_datetime: string;
  age_seconds: number;
}

export interface LatestTelemetry {
  store_id: number;
  store_name: string;
  sensors: Record<string, SensorReading>;
  total_sensors: number;
}

/**
 * Cooler sensor reads room temp (~23°C) but should read cooler temp (~3°C),
 * so subtract a fixed calibration offset.
 */
export function adjustSensorValue(sensor: string, value: number): number {
  if (sensor === 'cooler_temp_c') return value - 20.0;
  return value;
}

const RANGES: Record<string, { min: number; max: number }> = {
  cooler_temp_c: { min: 1, max: 4 },
  cooler_temp_f: { min: 34, max: 40 },
  cooler_humidity_pct: { min: 60, max: 75 },
  freezer_temp_c: { min: -20, max: -15 },
};

export function getSensorStatus(sensor: string, value: number): SensorStatus {
  const adjusted = adjustSensorValue(sensor, value);
  const range = RANGES[sensor];
  if (!range) return 'ok';
  if (adjusted < range.min * 0.9 || adjusted > range.max * 1.1) return 'critical';
  if (adjusted < range.min || adjusted > range.max) return 'warning';
  return 'ok';
}

export function formatSensorValue(sensor: string, value: number, unit: string | null): string {
  const adjusted = adjustSensorValue(sensor, value);
  if (sensor.includes('temp') && (unit === 'celsius' || unit === null)) {
    return `${((adjusted * 9) / 5 + 32).toFixed(1)}°F`;
  }
  if (unit) {
    if (unit === 'pct') return `${adjusted.toFixed(1)}%`;
    return `${adjusted.toFixed(1)} ${unit}`;
  }
  return adjusted.toFixed(1);
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
