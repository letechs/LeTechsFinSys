# EA License Version - Local Copy Trading

## Overview

This is the **EA License tier** version of the LeTechs Copy Trading EA. It provides local copy trading functionality with backend license validation.

## Features

- ✅ **Local Copy Trading** - Master → Slave copy trading on same machine
- ✅ **License Validation** - Validates license via backend API
- ✅ **Offline Mode** - Works with cached license if API unavailable
- ✅ **Symbol Mapping** - Supports different symbol names across brokers
- ✅ **Lot Sizing** - Multiple lot sizing modes (fixed, equity-based, multiplier)
- ✅ **SL/TP Copying** - Copies stop loss and take profit from master
- ✅ **Reverse Trades** - Optional reverse trade direction
- ✅ **No Backend Dependency** - Only license check (once per day/startup)

## Setup

### 1. Configure License Settings

In EA inputs, configure:

- **LicenseApiUrl**: Your backend API URL (e.g., `http://localhost:5000` or `https://your-api.com`)
- **UserId**: Your user ID from the platform dashboard
- **MT5AccountNumbers**: Comma-separated list of your MT5 account numbers (e.g., `"12345,67890"`)
- **LicenseCheckFrequency**: 
  - `CHECK_ON_STARTUP` - Check only when EA starts (recommended)
  - `CHECK_DAILY` - Check once per day
  - `CHECK_HOURLY` - Check once per hour

### 2. Configure Copy Trading Settings

- **Mode**: `MODE_SLAVE` for slave accounts, `MODE_MASTER` for master accounts
- **clogin_master**: Master account login ID
- **LotMode**: Lot sizing method
- **CopySLTP**: Copy stop loss and take profit
- **MirrorOnClose**: Close slave positions when master closes

### 3. Add API URL to MT5 WebRequest Allowed URLs

1. Open MT5
2. Go to **Tools → Options → Expert Advisors**
3. Check **"Allow WebRequest for listed URL"**
4. Add your backend API URL (e.g., `http://localhost:5000` or `https://your-api.com`)

## How It Works

### License Validation Flow

1. **On EA Startup:**
   - EA calls `POST /api/license/validate` with UserId and MT5 account numbers
   - Backend validates subscription and returns license info
   - EA caches license info locally

2. **During Operation:**
   - EA checks cached license before operations
   - If expired, EA stops copy trading
   - If API unavailable, EA uses cached license (offline mode)

3. **Periodic Check (if enabled):**
   - EA checks license periodically (daily/hourly) based on setting
   - Updates cache if license renewed

### Copy Trading Flow

1. **Master EA:**
   - Writes snapshot file with open positions
   - Updates snapshot every second

2. **Slave EA:**
   - Reads master snapshot file
   - Compares with previous snapshot
   - Opens/closes positions to match master
   - Uses symbol mapping for different broker symbols

## Files

- `CopyTradingEA_License.mq5` - Main EA file
- `LicenseValidator.mqh` - License validation service
- `LicenseHttpClient.mqh` - HTTP client for API calls

## License Cache

License information is cached locally in `license_cache.bin` file. This allows:
- **Offline operation** - EA works even if API is temporarily unavailable
- **Faster startup** - Uses cache if API check fails
- **Automatic renewal** - Updates cache when license is renewed

## Troubleshooting

### License Validation Failed

**Error:** "License validation failed on startup!"

**Solutions:**
1. Check `LicenseApiUrl` is correct
2. Check `UserId` and `MT5AccountNumbers` are correct
3. Check API URL is added to MT5 WebRequest allowed URLs
4. Check backend is running and accessible
5. Check subscription is active and not expired

### API Unavailable

**Behavior:** EA uses cached license (offline mode)

**Note:** EA will continue working with cached license. License will be revalidated on next check.

### Account Not Allowed

**Error:** "Invalid account numbers"

**Solution:** Ensure MT5 account numbers in EA inputs match your subscription.

## Support

- Website: https://www.letechs.com
- Support: +971 544569987

## Differences from Full Access EA

| Feature | EA License | Full Access |
|---------|-----------|-------------|
| Copy Trading | ✅ Local only | ✅ Local + Web Terminal |
| License Check | ✅ API (once/day) | ✅ Continuous |
| Backend Connection | ✅ Minimal (license only) | ✅ Continuous (heartbeats) |
| Web Terminal | ❌ Not available | ✅ Available |
| Dashboard | ❌ Limited | ✅ Full access |

## Notes

- This EA is for **EA License tier** users only
- Requires valid subscription from backend
- License is validated via API (minimal backend usage)
- All copy trading happens locally (no backend dependency)

