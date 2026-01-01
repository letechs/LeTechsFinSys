# EA Files Directory

This directory contains the compiled Expert Advisor (.ex5) files for download.

## Available Files (Current)

1. **CopyTradingEA_License.ex5** ✅ (Available)
   - For EA License tier users
   - Compiled from: `MT5-EA-License/CopyTradingEA_License.mq5`
   - Status: **Completed and ready for download**

## Coming Soon

2. **CopyTradingEA.ex5** ⏳ (Under Development)
   - For Full Access tier users
   - Compiled from: `MT5-EA/CopyTradingEA.mq5`
   - Status: **Not yet completed - will be added later**

## How to Compile

1. Open MetaEditor in MetaTrader 5
2. Open the source `.mq5` file
3. Press **F7** or click **Compile** button
4. Check for compilation errors
5. The compiled `.ex5` file will be generated in the `MetaTrader 5/MQL5/Experts/` directory
6. Copy the `.ex5` file to this directory (`frontend/public/ea/`)

**Note:** MT5 uses `.ex5` extension (not `.ex4` which is for MT4)

## File Naming

- Files must be named exactly as shown above (case-sensitive)
- Do not rename the files
- The download handler expects these exact file names
- Use `.ex5` extension (MT5 format)

## Access

Files in this directory are publicly accessible at:
- `/ea/CopyTradingEA_License.ex5` ✅ (Available)

The download functionality is implemented in:
- `frontend/app/dashboard/ea-download/page.tsx`

## Current Status

- ✅ **EA License Version**: Ready for download
- ⏳ **Full Access Version**: Under development (will be added later)

