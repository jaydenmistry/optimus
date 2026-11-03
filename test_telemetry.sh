#!/bin/bash

# Test script to verify IoT Telemetry Dashboard Card is working

echo "🧪 IoT Telemetry Dashboard Card - End-to-End Test"
echo "=================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check backend health
echo "Test 1: Backend Health Check"
HEALTH=$(curl -s http://localhost:8000/api/health)
if echo "$HEALTH" | grep -q '"status":"ok"'; then
    echo -e "${GREEN}✅ Backend is running${NC}"
else
    echo -e "${RED}❌ Backend is not responding${NC}"
    exit 1
fi
echo ""

# Test 2: Post a test telemetry reading
echo "Test 2: POST Telemetry Reading"
POST_RESULT=$(curl -s -X POST http://localhost:8000/api/telemetry \
    -H "Content-Type: application/json" -H "X-API-Key: ${TELEMETRY_API_KEY:-}" \
    -d '{"store_id":1,"sensor":"cooler_temp_c","value":28.5}')

if echo "$POST_RESULT" | grep -q '"success":true'; then
    echo -e "${GREEN}✅ Successfully posted telemetry reading${NC}"
    TELEMETRY_ID=$(echo "$POST_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['id'])")
    echo "   Created record ID: $TELEMETRY_ID"
else
    echo -e "${RED}❌ Failed to post telemetry${NC}"
    exit 1
fi
echo ""

# Test 3: Retrieve latest telemetry
echo "Test 3: GET Latest Telemetry"
LATEST=$(curl -s http://localhost:8000/api/telemetry/1/latest)

if echo "$LATEST" | grep -q '"store_id":1'; then
    echo -e "${GREEN}✅ Successfully retrieved latest telemetry${NC}"
    
    # Display basic info
    STORE_NAME=$(echo "$LATEST" | python3 -c "import sys,json; print(json.load(sys.stdin)['store_name'])")
    SENSOR_COUNT=$(echo "$LATEST" | python3 -c "import sys,json; print(json.load(sys.stdin)['total_sensors'])")
    
    echo "   Store: $STORE_NAME"
    echo "   Total Sensors: $SENSOR_COUNT"
    echo ""
    echo "   ✅ Telemetry data retrieved successfully"
else
    echo -e "${RED}❌ Failed to retrieve telemetry${NC}"
    exit 1
fi
echo ""

# Test 4: Check frontend is accessible
echo "Test 4: Frontend Accessibility"
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000)

if [ "$FRONTEND_STATUS" == "200" ]; then
    echo -e "${GREEN}✅ Frontend is accessible at http://localhost:3000${NC}"
else
    echo -e "${RED}❌ Frontend returned status code: $FRONTEND_STATUS${NC}"
    exit 1
fi
echo ""

# Test 5: Post a critical reading for demo
echo "Test 5: Simulate Critical Alert"
CRITICAL_POST=$(curl -s -X POST http://localhost:8000/api/telemetry \
    -H "Content-Type: application/json" -H "X-API-Key: ${TELEMETRY_API_KEY:-}" \
    -d '{"store_id":1,"sensor":"cooler_temp_c","value":31.6}')

if echo "$CRITICAL_POST" | grep -q '"success":true'; then
    echo -e "${YELLOW}⚠️  Posted CRITICAL temperature reading: 31.6°C${NC}"
    echo "   This should trigger a red CRITICAL badge on the dashboard"
else
    echo -e "${RED}❌ Failed to post critical reading${NC}"
fi
echo ""

# Summary
echo "=================================================="
echo "🎉 All Tests Passed!"
echo "=================================================="
echo ""
echo "Next Steps:"
echo "1. Open http://localhost:3000 in your browser"
echo "2. Look for the 'IoT Sensor Data' card below the alert cards"
echo "3. You should see a CRITICAL badge (red) for cooler temperature"
echo "4. Wait 10 seconds and the card will auto-refresh"
echo ""
echo "For live simulation, run:"
echo "  ./simulate_sensors.sh"
echo ""
