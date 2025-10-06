# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies (TypeScript is listed but needs installation)
npm install

# Build TypeScript to JavaScript
npx tsc

# Development - runs TypeScript directly via tsx
npm run dev        # Runs src/pio-checker.ts
npm run test:ts    # Runs src/test.ts

# Production - builds then runs
npm start          # Build + run dist/pio-checker.js
npm run check      # Same as npm start
npm run check:all  # Check all accounts
npm run check:single # Check single account

# Clean build artifacts
npm run clean
```

## Architecture

This is a web scraping automation tool for monitoring Polish Immigration Office (PIO) application status:

- **Multi-account support**: Uses `accounts.json` to manage multiple PIO accounts with credentials
- **PIOChecker class** (src/pio-checker.ts): Core scraping logic for single account
  - Handles login, navigation, data extraction from tables
  - Compares current data with previous snapshots
  - Sends notifications on changes (email + desktop)
- **MultiAccountChecker class**: Orchestrates checking multiple accounts sequentially
- **Data persistence**: Saves snapshots in `data/{accountId}/` directories as timestamped JSON files
- **Notification system**:
  - Email via Gmail SMTP (requires `mail` and `pass` in .env)
  - Desktop notifications via node-notifier (macOS/Windows/Linux)

## Configuration

1. **accounts.json**: Array of account objects with:
   - `login`: Email for PIO account
   - `password`: Account password
   - `elementText`: Application ID to search for

2. **.env file**: Gmail SMTP credentials
   - `mail`: Gmail address
   - `pass`: Gmail app password

3. **Chrome path**: Hardcoded for macOS at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`

## Key Implementation Details

- Uses Puppeteer with non-headless Chrome for reliable scraping
- Extracts structured data from HTML tables into nested arrays
- Compares serialized JSON to detect changes between runs
- Implements retry logic (3 attempts) for browser operations
- TypeScript with strict mode and comprehensive type checking
- Direct TypeScript execution via tsx for development