#!/bin/bash
# Test Script for Phase 1: License Validation API
# This script tests the backend license validation endpoint without MT5

BASE_URL="http://localhost:5000"
ENDPOINT="$BASE_URL/api/license/validate"

echo "========================================"
echo "Testing License Validation API"
echo "========================================"
echo ""

# Test 1: Valid License Request
echo "Test 1: Valid License Request"
echo "----------------------------------------"

# Replace these with actual values from your database
USER_ID="YOUR_USER_ID_HERE"  # Replace with actual user ID
ACCOUNTS='["12345", "67890"]'  # Replace with actual MT5 account numbers

BODY="{\"userId\":\"$USER_ID\",\"mt5Accounts\":$ACCOUNTS}"

echo "Request Body:"
echo "$BODY"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "$BODY")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY_RESPONSE=$(echo "$RESPONSE" | sed '$d')

echo "HTTP Status: $HTTP_CODE"
echo "Response:"
echo "$BODY_RESPONSE" | jq '.' 2>/dev/null || echo "$BODY_RESPONSE"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
    VALID=$(echo "$BODY_RESPONSE" | jq -r '.data.valid' 2>/dev/null)
    if [ "$VALID" = "true" ]; then
        echo "✅ Test 1 PASSED: License validation successful"
        TIER=$(echo "$BODY_RESPONSE" | jq -r '.data.tier' 2>/dev/null)
        EXPIRY=$(echo "$BODY_RESPONSE" | jq -r '.data.expiryDate' 2>/dev/null)
        echo "   Tier: $TIER"
        echo "   Expiry: $EXPIRY"
    else
        echo "❌ Test 1 FAILED: License validation failed"
    fi
else
    echo "❌ Test 1 FAILED: HTTP $HTTP_CODE"
fi

echo ""
echo "========================================"
echo ""

# Test 2: Invalid User ID
echo "Test 2: Invalid User ID"
echo "----------------------------------------"

BODY2='{"userId":"INVALID_USER_ID","mt5Accounts":["12345"]}'

echo "Request Body:"
echo "$BODY2"
echo ""

RESPONSE2=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "$BODY2")

HTTP_CODE2=$(echo "$RESPONSE2" | tail -n1)
BODY_RESPONSE2=$(echo "$RESPONSE2" | sed '$d')

echo "HTTP Status: $HTTP_CODE2"
echo "Response:"
echo "$BODY_RESPONSE2" | jq '.' 2>/dev/null || echo "$BODY_RESPONSE2"
echo ""

if [ "$HTTP_CODE2" = "403" ] || [ "$HTTP_CODE2" = "200" ]; then
    VALID2=$(echo "$BODY_RESPONSE2" | jq -r '.data.valid' 2>/dev/null)
    if [ "$VALID2" = "false" ]; then
        echo "✅ Test 2 PASSED: Correctly rejected invalid user"
    else
        echo "❌ Test 2 FAILED: Should have rejected invalid user"
    fi
else
    echo "⚠️  Test 2: Got HTTP $HTTP_CODE2"
fi

echo ""
echo "========================================"
echo ""

# Test 3: Missing Required Fields
echo "Test 3: Missing Required Fields"
echo "----------------------------------------"

BODY3='{"userId":"","mt5Accounts":[]}'

echo "Request Body:"
echo "$BODY3"
echo ""

RESPONSE3=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "$BODY3")

HTTP_CODE3=$(echo "$RESPONSE3" | tail -n1)
BODY_RESPONSE3=$(echo "$RESPONSE3" | sed '$d')

echo "HTTP Status: $HTTP_CODE3"
echo "Response:"
echo "$BODY_RESPONSE3" | jq '.' 2>/dev/null || echo "$BODY_RESPONSE3"
echo ""

if [ "$HTTP_CODE3" = "400" ]; then
    echo "✅ Test 3 PASSED: Correctly returned 400 Bad Request"
else
    echo "⚠️  Test 3: Got HTTP $HTTP_CODE3 (expected 400)"
fi

echo ""
echo "========================================"
echo "Test Summary"
echo "========================================"
echo ""
echo "To test with real data:"
echo "1. Start your backend server"
echo "2. Update USER_ID with a real user ID from your database"
echo "3. Update ACCOUNTS with real MT5 account numbers"
echo "4. Run this script again"
echo ""

