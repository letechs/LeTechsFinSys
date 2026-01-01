#!/bin/bash

# MongoDB Restore Script
# 
# This script restores a MongoDB database from a backup
# 
# Usage:
#   ./restore-mongodb.sh <backup-file.tar.gz>
#   ./restore-mongodb.sh <backup-file.tar.gz> --drop
#
# Options:
#   --drop: Drop existing collections before restore (WARNING: This will delete existing data)
#
# Requirements:
#   - mongorestore must be installed (comes with MongoDB)
#   - MONGODB_URI environment variable or configure below
#
# WARNING: This script will restore data to your database.
# Make sure you have a backup of your current data before running this!

set -e  # Exit on error

# Check if backup file is provided
if [ -z "$1" ]; then
    echo "❌ Error: Backup file not provided"
    echo "Usage: $0 <backup-file.tar.gz> [--drop]"
    exit 1
fi

BACKUP_FILE="$1"
DROP_COLLECTIONS=false

# Check for --drop flag
if [ "$2" == "--drop" ]; then
    DROP_COLLECTIONS=true
    echo "⚠️  WARNING: --drop flag detected. Existing collections will be dropped!"
    read -p "Are you sure you want to continue? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo "Restore cancelled"
        exit 0
    fi
fi

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Error: Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Get MongoDB URI from environment or use default
MONGODB_URI="${MONGODB_URI:-mongodb://localhost:27017/letechs-copy-trading}"

# Parse MongoDB URI to extract connection details
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
    # MongoDB Atlas
    echo "⚠️  MongoDB Atlas connection string detected."
    MONGO_USER="${BASH_REMATCH[1]}"
    MONGO_PASS="${BASH_REMATCH[2]}"
    MONGO_HOST="${BASH_REMATCH[3]}"
    MONGO_DB="${BASH_REMATCH[4]}"
    MONGO_PORT=""
else
    echo "❌ Error: Could not parse MONGODB_URI: $MONGODB_URI"
    exit 1
fi

# Create temporary directory for extraction
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Extract backup
echo "📦 Extracting backup..."
tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"

# Find the extracted backup directory (should contain the database name)
BACKUP_DIR=$(find "$TEMP_DIR" -type d -name "$MONGO_DB" | head -n 1)

if [ -z "$BACKUP_DIR" ]; then
    # Try to find any directory
    BACKUP_DIR=$(find "$TEMP_DIR" -mindepth 1 -maxdepth 1 -type d | head -n 1)
fi

if [ -z "$BACKUP_DIR" ]; then
    echo "❌ Error: Could not find backup data in archive"
    exit 1
fi

# Build mongorestore command
if [ -n "$MONGO_USER" ] && [ -n "$MONGO_PASS" ]; then
    # With authentication
    if [ -n "$MONGO_PORT" ]; then
        # Standard connection
        RESTORE_CMD="mongorestore --host $MONGO_HOST --port $MONGO_PORT --username $MONGO_USER --password $MONGO_PASS --authenticationDatabase admin --db $MONGO_DB"
    else
        # MongoDB Atlas (use connection string)
        RESTORE_CMD="mongorestore --uri \"$MONGODB_URI\""
    fi
else
    # Without authentication
    if [ -n "$MONGO_PORT" ]; then
        RESTORE_CMD="mongorestore --host $MONGO_HOST --port $MONGO_PORT --db $MONGO_DB"
    else
        echo "❌ Error: Could not determine connection parameters"
        exit 1
    fi
fi

# Add --drop flag if specified
if [ "$DROP_COLLECTIONS" = true ]; then
    RESTORE_CMD="$RESTORE_CMD --drop"
fi

# Add backup directory
RESTORE_CMD="$RESTORE_CMD $BACKUP_DIR"

# Restore database
echo "🔄 Restoring database..."
echo "   Database: $MONGO_DB"
echo "   Host: $MONGO_HOST"
if [ "$DROP_COLLECTIONS" = true ]; then
    echo "   Mode: Drop and restore (existing data will be deleted)"
else
    echo "   Mode: Restore (existing data will be merged/overwritten)"
fi
echo ""

eval $RESTORE_CMD

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Database restored successfully"
else
    echo ""
    echo "❌ Error: Restore failed"
    exit 1
fi

