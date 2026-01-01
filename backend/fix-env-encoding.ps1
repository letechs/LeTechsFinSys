# PowerShell script to fix .env file encoding (remove BOM)
# Run: powershell -ExecutionPolicy Bypass -File fix-env-encoding.ps1

$envFile = ".env"
$backupFile = ".env.backup"

Write-Host "Checking .env file encoding..." -ForegroundColor Yellow

# Create backup
if (Test-Path $envFile) {
    Copy-Item $envFile $backupFile -Force
    Write-Host "✅ Backup created: $backupFile" -ForegroundColor Green
}

# Read file content
$content = Get-Content $envFile -Raw -Encoding UTF8

# Check for BOM
$bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
if ($bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    Write-Host "⚠️  UTF-8 BOM detected! Removing..." -ForegroundColor Red
    
    # Remove BOM by reading without BOM
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    $content = [System.IO.File]::ReadAllText($envFile, $utf8NoBom)
    
    # Write back without BOM
    [System.IO.File]::WriteAllText($envFile, $content, $utf8NoBom)
    
    Write-Host "✅ BOM removed! File saved as UTF-8 without BOM" -ForegroundColor Green
} else {
    Write-Host "✅ No BOM detected. File is already clean." -ForegroundColor Green
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Restart your backend server" -ForegroundColor White
Write-Host "2. Test Stripe connection again" -ForegroundColor White


