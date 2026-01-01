# MongoDB Backup Script (PowerShell - Windows)
# 
# This script creates a backup of the MongoDB database on Windows
# 
# Usage:
#   .\backup-mongodb.ps1
#   .\backup-mongodb.ps1 -BackupDir "C:\backups"
#
# Requirements:
#   - mongodump must be installed and in PATH (comes with MongoDB)
#   - MONGODB_URI environment variable or configure below
#
# Configuration:
#   - BackupDir: Directory to store backups (default: .\backups)
#   - RetentionDays: Number of days to keep backups (default: 30)
#   - BackupPrefix: Prefix for backup files (default: backup)
#
# Scheduled Task Example (daily at 2 AM):
#   Create a scheduled task that runs: powershell.exe -File "C:\path\to\backend\scripts\backup-mongodb.ps1"

param(
    [string]$BackupDir = ".\backups",
    [int]$RetentionDays = 30,
    [string]$BackupPrefix = "backup"
)

$ErrorActionPreference = "Stop"

# Get MongoDB URI from environment or use default
$MongoDBUri = if ($env:MONGODB_URI) { $env:MONGODB_URI } else { "mongodb://localhost:27017/letechs-copy-trading" }

# Parse MongoDB URI
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupName = "${BackupPrefix}_${timestamp}"

# Create backup directory if it doesn't exist
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

Write-Host "📦 Starting MongoDB backup..." -ForegroundColor Cyan
Write-Host "   MongoDB URI: $MongoDBUri" -ForegroundColor Gray
Write-Host "   Backup location: $BackupDir\$backupName" -ForegroundColor Gray
Write-Host ""

# Build mongodump command
if ($MongoDBUri -match "^mongodb\+srv://") {
    # MongoDB Atlas
    Write-Host "⚠️  MongoDB Atlas connection string detected." -ForegroundColor Yellow
    Write-Host "   MongoDB Atlas provides automatic backups. This script is for self-hosted MongoDB." -ForegroundColor Yellow
    $dumpCmd = "mongodump --uri `"$MongoDBUri`" --out `"$BackupDir\$backupName`""
} else {
    # Standard MongoDB connection
    $dumpCmd = "mongodump --uri `"$MongoDBUri`" --out `"$BackupDir\$backupName`""
}

# Create backup
try {
    Invoke-Expression $dumpCmd
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "🗜️  Compressing backup..." -ForegroundColor Cyan
        
        # Compress backup using .NET compression
        $backupPath = Join-Path $BackupDir $backupName
        $zipPath = Join-Path $BackupDir "${backupName}.zip"
        
        # Use Compress-Archive (PowerShell 5.0+)
        Compress-Archive -Path "$backupPath\*" -DestinationPath $zipPath -Force
        
        # Remove uncompressed directory
        Remove-Item -Path $backupPath -Recurse -Force
        
        Write-Host "✅ Backup completed successfully: $zipPath" -ForegroundColor Green
        
        # Cleanup old backups
        Write-Host "🧹 Cleaning up old backups (keeping last $RetentionDays days)..." -ForegroundColor Cyan
        $cutoffDate = (Get-Date).AddDays(-$RetentionDays)
        Get-ChildItem -Path $BackupDir -Filter "${BackupPrefix}_*.zip" | 
            Where-Object { $_.LastWriteTime -lt $cutoffDate } | 
            Remove-Item -Force
        
        Write-Host "✅ Cleanup completed" -ForegroundColor Green
        Write-Host ""
        Write-Host "✅ Backup process completed successfully" -ForegroundColor Green
    } else {
        Write-Host "❌ Error: Backup failed (exit code: $LASTEXITCODE)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Error: Backup failed" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

