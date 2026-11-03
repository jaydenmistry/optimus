import argparse, os, re, time, json
import serial
import requests

RE = re.compile(r"Humidity:\s*([\d.]+)%\s*Temperature:\s*([\d.]+)°C\s*([\d.]+)°F")

# The demo DHT sensor sits at room temperature (~23°C) instead of inside a
# cooler (~3°C). Calibrate here, at the one source that needs it, so the API
# only ever stores realistic cooler readings and the dashboard shows them as-is.
DEFAULT_COOLER_OFFSET_C = -20.0


def calibrate(sensor, value, offset_c):
    if sensor == "cooler_temp_c":
        return float(value) + offset_c
    if sensor == "cooler_temp_f":
        return float(value) + offset_c * 9 / 5
    return float(value)

def post(api_url, store_id, sensor, value, unit=None, api_key=None):
    payload = {"store_id": store_id, "sensor": sensor, "value": float(value)}
    if unit: payload["unit"] = unit
    headers = {"X-API-Key": api_key} if api_key else {}
    r = requests.post(api_url, json=payload, headers=headers, timeout=3)  # JSON POST pattern [web:292]
    if r.status_code in (401, 403):
        print(f"Telemetry rejected ({r.status_code}): {r.text}. Check --api-key / TELEMETRY_API_KEY.")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", default="/dev/cu.usbmodem2101")
    # COM7 for Windows, /dev/cu.usbmodem101 for macOS, adjust as needed
    # pip3 install pyserial requests
    # python3 -m serial.tools.list_ports
    ap.add_argument("--baud", type=int, default=9600)
    ap.add_argument("--store-id", type=int, default=1)
    ap.add_argument("--api", default="http://localhost:8000/api/telemetry")
    ap.add_argument("--api-key", default=os.environ.get("TELEMETRY_API_KEY"),
                    help="sent as X-API-Key; must match the server's TELEMETRY_API_KEY (defaults to that env var)")
    ap.add_argument("--cooler-offset", type=float, default=DEFAULT_COOLER_OFFSET_C,
                    help="°C added to cooler temperature readings (0 if the sensor is really in a cooler)")
    args = ap.parse_args()
    send = lambda store_id, sensor, value, unit=None: post(
        args.api, store_id, sensor, calibrate(sensor, value, args.cooler_offset), unit, args.api_key)

    ser = serial.Serial(args.port, args.baud, timeout=2)  # typical pySerial usage [web:287]
    time.sleep(2)  # let Arduino reset

    while True:
        line = ser.readline().decode(errors="ignore").strip()  # read line loop [web:287]
        if not line:
            continue

        # If you later switch Arduino to JSON output, this will just work:
        if line.startswith("{") and line.endswith("}"):
            obj = json.loads(line)
            send(obj.get("store_id", args.store_id), obj["sensor"], obj["value"], obj.get("unit"))
            continue

        m = RE.search(line)
        if not m:
            continue

        humidity, temp_c, temp_f = m.groups()
        send(args.store_id, "cooler_humidity_pct", humidity, "pct")
        send(args.store_id, "cooler_temp_c", temp_c, "celsius")
        send(args.store_id, "cooler_temp_f", temp_f, "fahrenheit")

if __name__ == "__main__":
    main()
