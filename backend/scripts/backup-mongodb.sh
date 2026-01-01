#!/bin/bash

# MongoDB Backup Script
# 
# This script creates a backup of the MongoDB database
# 
# Usage:
#   ./backup-mongodb.sh
#   ./backup-mongodb.sh /custom/backup/path
#
# Requirements:
#   - mongodump must be installed (comes with MongoDB)
#   - MONGODB_URI environment variable or configure below
#
# Configuration:
#   - BACKUP_DIR: Directory to store backups (default: ./backups)
#   - RETENTION_DAYS: Number of days to keep backups (default: 30)
#   - BACKUP_PREFIX: Prefix for backup files (default: backup)
#
# Cron Example (daily at 2 AM):
#   0 2 * * * /path/to/backend/scripts/backup-mongodb.sh >> /path/to/backend/logs/backup.log 2>&1

set -e  # Exit on error

# Configuration
BACKUP_DIR="${1:-./backups}"
RETENTION_DAYS=30
BACKUP_PREFIX="backup"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="${BACKUP_PREFIX}_${TIMESTAMP}"

# Get MongoDB URI from environment or use default
MONGODB_URI="${MONGODB_URI:-mongodb://localhost:27017/letechs-copy-trading}"

# Parse MongoDB URI to extract connection details
# Format: mongodb://[username:password@]host:port/database
if [[ $MONGODB_URI =~ mongodb://([^:]+):([^@]+)@([^:]+):([0-9]+)/(.+) ]]; then
    # With authentication
    MONGO_USER="${BASH_REMATCH[1]}"
    MONGO_PASS="${BASH_REMATCH[2]}"
    MONGO_HOST="${BASH_REMATCH[3]}"
    MONGO_PORT="${BASH_REMATCH[4]}"
    MONGO_DB="${BASH_REMATCH[5]}"
elif [[ $MONGODB_URI =~ mongodb://([^:]+):([0-9]+)/(.+) ]]; then
    # Without authentication
    MONGO_HOST="${BASH_REMATCH[1]}"
    MONGO_PORT="${BASH_REMATCH[2]}"
    MONGO_DB="${BASH_REMATCH[3]}"
    MONGO_USER=""
    MONGO_PASS=""
elif [[ $MONGODB_URI =~ mongodb\+srv://([^:]+):([^@]+)@([^/]+)/(.+) ]]; then
    # MongoDB Atlas (connection string)
    echo "⚠️  MongoDB Atlas connection string detected."
    echo "   MongoDB Atlas provides automatic backups. This script is for self-hosted MongoDB."
    echo "   If you still want to use this script with Atlas, ensure mongodump supports connection strings."
    MONGO_USER="${BASH_REMATCH[1]}"
    MONGO_PASS="${BASH_REMATCH[2]}"
    MONGO_HOST="${BASH_REMATCH[3]}"
    MONGO_DB="${BASH_REMATCH[4]}"
    MONGO_PORT=""
else
    echo "❌ Error: Could not parse MONGODB_URI: $MONGODB_URI"
    exit 1
fi

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Build mongodump command
if [ -n "$MONGO_USER" ] && [ -n "$MONGO_PASS" ]; then
    # With authentication
    if [ -n "$MONGO_PORT" ]; then
        # Standard connection
        DUMP_CMD="mongodump --host $MONGO_HOST --port $MONGO_PORT --username $MONGO_USER --password $MONGO_PASS --authenticationDatabase admin --db $MONGO_DB --out $BACKUP_DIR/$BACKUP_NAME"
    else
        # MongoDB Atlas (use connection string)
        DUMP_CMD="mongodump --uri \"$MONGODB_URI\" --out $BACKUP_DIR/$BACKUP_NAME"
    fi
else
    # Without authentication
    if [ -n "$MONGO_PORT" ]; then
        DUMP_CMD="mongodump --host $MONGO_HOST --port $MONGO_PORT --db $MONGO_DB --out $BACKUP_DIR/$BACKUP_NAME"
    else
        echo "❌ Error: Could not determine connection parameters"
        exit 1
    fi
fi

# Create backup
echo "📦 Starting MongoDB backup..."
echo "   Database: $MONGO_DB"
echo "   Host: $MONGO_HOST"
echo "   Backup location: $BACKUP_DIR/$BACKUP_NAME"
echo ""

eval $DUMP_CMD

if [ $? -eq 0 ]; then
    # Compress backup
    echo "🗜️  Compressing backup..."
    tar -czf "$BACKUP_DIR/${BACKUP_NAME}.tar.gz" -C "$BACKUP_DIR" "$BACKUP_NAME"
    
    if [ $? -eq 0 ]; then
        # Remove uncompressed directory
        rm -rf "$BACKUP_DIR/$BACKUP_NAME"
        echo "✅ Backup completed successfully: $BACKUP_DIR/${BACKUP_NAME}.tar.gz"
        
        # Cleanup old backups (keep last 30 days)
        echo "🧹 Cleaning up old backups (keeping last $RETENTION_DAYS days)..."
        find "$BACKUP_DIR" -name "${BACKUP_PREFIX}_*.tar.gz" -type f -mtime +$RETENTION_DAYS -delete
        echo "✅ Cleanup completed"
    else
        echo "❌ Error: Failed to compress backup"
        exit 1
    fi
else
    echo "❌ Error: Backup failed"
    exit 1
fi

echo ""
echo "✅ Backup process completed successfully"

