#!/bin/bash

# Simulate IoT sensors sending telemetry data
# This script posts realistic sensor readings to the telemetry API

# Override for production, e.g.:
#   API_URL=https://optimus.jmistry.com/api/telemetry TELEMETRY_API_KEY=... ./simulate_sensors.sh
API_URL="${API_URL:-http://localhost:8000/api/telemetry}"

echo "🌡️  Starting IoT sensor simulation..."
echo "Press Ctrl+C to stop"
echo ""

# Function to generate cooler temperature (normal: 2-4°C, occasionally drift to 24-26°C)
generate_cooler_temp() {
    if [ $((RANDOM % 10)) -eq 0 ]; then
        # 10% chance: temperature warning (rising)
        echo "scale=2; 24 + ($RANDOM % 300) / 100" | bc
    else
        # 90% chance: normal temperature
        echo "scale=2; 2 + ($RANDOM % 200) / 100" | bc
    fi
}

# Function to generate humidity (normal: 65-70%, occasionally spike to 75-80%)
generate_humidity() {
    if [ $((RANDOM % 15)) -eq 0 ]; then
        # ~7% chance: humidity spike
        echo "scale=2; 75 + ($RANDOM % 500) / 100" | bc
    else
        # Normal humidity
        echo "scale=2; 65 + ($RANDOM % 500) / 100" | bc
    fi
}

# Function to generate freezer temp (normal: -18 to -16°C)
generate_freezer_temp() {
    echo "scale=2; -18 + ($RANDOM % 200) / 100" | bc
}

# Function to generate ambient temp (normal: 20-24°C)
generate_ambient_temp() {
    echo "scale=2; 20 + ($RANDOM % 400) / 100" | bc
}

# Main loop - send readings every 5 seconds
COUNTER=0
while true; do
    COUNTER=$((COUNTER + 1))
    
    # Cycle through all 5 stores
    for STORE_ID in {1..5}; do
        # Send cooler temperature
        TEMP=$(generate_cooler_temp)
        curl -s -X POST "$API_URL" \
            -H "Content-Type: application/json" -H "X-API-Key: ${TELEMETRY_API_KEY:-}" \
            -d "{\"store_id\":$STORE_ID,\"sensor\":\"cooler_temp_c\",\"value\":$TEMP}" \
            > /dev/null
        
        # Send humidity
        HUMIDITY=$(generate_humidity)
        curl -s -X POST "$API_URL" \
            -H "Content-Type: application/json" -H "X-API-Key: ${TELEMETRY_API_KEY:-}" \
            -d "{\"store_id\":$STORE_ID,\"sensor\":\"cooler_humidity_pct\",\"value\":$HUMIDITY,\"unit\":\"pct\"}" \
            > /dev/null
        
        # Send freezer temperature
        FREEZER=$(generate_freezer_temp)
        curl -s -X POST "$API_URL" \
            -H "Content-Type: application/json" -H "X-API-Key: ${TELEMETRY_API_KEY:-}" \
            -d "{\"store_id\":$STORE_ID,\"sensor\":\"freezer_temp_c\",\"value\":$FREEZER,\"unit\":\"celsius\"}" \
            > /dev/null
        
        # Send ambient temperature
        AMBIENT=$(generate_ambient_temp)
        curl -s -X POST "$API_URL" \
            -H "Content-Type: application/json" -H "X-API-Key: ${TELEMETRY_API_KEY:-}" \
            -d "{\"store_id\":$STORE_ID,\"sensor\":\"ambient_temp_c\",\"value\":$AMBIENT,\"unit\":\"celsius\"}" \
            > /dev/null
    done
    
    echo "[$COUNTER] Sent readings for all 5 stores (cooler, humidity, freezer, ambient)"
    
    # Wait 5 seconds before next batch
    sleep 5
done
