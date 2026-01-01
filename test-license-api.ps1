# Test Script for Phase 1: License Validation API
# This script tests the backend license validation endpoint without MT5

$baseUrl = "http://localhost:5000"
$endpoint = "$baseUrl/api/license/validate"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Testing License Validation API" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Valid License Request
Write-Host "Test 1: Valid License Request" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Yellow

# You need to replace these with actual values from your database
$testUserId = "YOUR_USER_ID_HERE"  # Replace with actual user ID
$testAccounts = @("12345", "67890")  # Replace with actual MT5 account numbers

$body = @{
    userId = $testUserId
    mt5Accounts = $testAccounts
} | ConvertTo-Json

Write-Host "Request Body:" -ForegroundColor Gray
Write-Host $body -ForegroundColor Gray
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri $endpoint -Method Post -Body $body -ContentType "application/json"
    Write-Host "Response:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10 | Write-Host -ForegroundColor Green
    Write-Host ""
    
    if ($response.success -and $response.data.valid) {
        Write-Host "✅ Test 1 PASSED: License validation successful" -ForegroundColor Green
        Write-Host "   Tier: $($response.data.tier)" -ForegroundColor Gray
        Write-Host "   Expiry: $($response.data.expiryDate)" -ForegroundColor Gray
        Write-Host "   Allowed Accounts: $($response.data.allowedAccounts -join ', ')" -ForegroundColor Gray
    } else {
        Write-Host "❌ Test 1 FAILED: License validation failed" -ForegroundColor Red
        Write-Host "   Message: $($response.data.message)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Test 1 ERROR: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "   Response: $responseBody" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Test 2: Invalid User ID
Write-Host "Test 2: Invalid User ID" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Yellow

$body2 = @{
    userId = "INVALID_USER_ID"
    mt5Accounts = @("12345")
} | ConvertTo-Json

Write-Host "Request Body:" -ForegroundColor Gray
Write-Host $body2 -ForegroundColor Gray
Write-Host ""

try {
    $response2 = Invoke-RestMethod -Uri $endpoint -Method Post -Body $body2 -ContentType "application/json"
    Write-Host "Response:" -ForegroundColor Green
    $response2 | ConvertTo-Json -Depth 10 | Write-Host -ForegroundColor Green
    Write-Host ""
    
    if (-not $response2.success -and -not $response2.data.valid) {
        Write-Host "✅ Test 2 PASSED: Correctly rejected invalid user" -ForegroundColor Green
    } else {
        Write-Host "❌ Test 2 FAILED: Should have rejected invalid user" -ForegroundColor Red
    }
} catch {
    if ($_.Exception.Response.StatusCode -eq 403) {
        Write-Host "✅ Test 2 PASSED: Correctly returned 403 Forbidden" -ForegroundColor Green
    } else {
        Write-Host "❌ Test 2 ERROR: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Test 3: Missing Required Fields
Write-Host "Test 3: Missing Required Fields" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Yellow

$body3 = @{
    userId = ""
    mt5Accounts = @()
} | ConvertTo-Json

Write-Host "Request Body:" -ForegroundColor Gray
Write-Host $body3 -ForegroundColor Gray
Write-Host ""

try {
    $response3 = Invoke-RestMethod -Uri $endpoint -Method Post -Body $body3 -ContentType "application/json"
    Write-Host "❌ Test 3 FAILED: Should have rejected empty fields" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode -eq 400) {
        Write-Host "✅ Test 3 PASSED: Correctly returned 400 Bad Request" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Test 3: Got error but not 400: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To test with real data:" -ForegroundColor Yellow
Write-Host "1. Start your backend server" -ForegroundColor Gray
Write-Host "2. Update testUserId with a real user ID from your database" -ForegroundColor Gray
Write-Host "3. Update testAccounts with real MT5 account numbers" -ForegroundColor Gray
Write-Host "4. Run this script again" -ForegroundColor Gray
Write-Host ""
Write-Host "To get a user ID:" -ForegroundColor Yellow
Write-Host "  - Check your MongoDB database" -ForegroundColor Gray
Write-Host "  - Or use: db.users.find().pretty()" -ForegroundColor Gray
Write-Host ""

