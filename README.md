# PIO Website Checker

Automated tool for monitoring PIO (Polish Immigration Office) website application status with intelligent data comparison and macOS notifications.

## Features

- **Automated Login**: Secure credential management via `.env` file
- **Data Extraction**: Extracts structured data from application pages
- **Intelligent Comparison**: Detects changes in application status, dates, and content
- **macOS Notifications**: Native system notifications for status changes
- **Headless Operation**: Runs silently in background for automated monitoring

## Installation

```bash
npm install
```

## Setup

1. Create a `.env` file with your credentials:
```bash
LOGIN=your_username
PASSWORD=your_password
```

2. Run the checker:
```bash
npm start
```

## Usage

### Monitor Application Status
```bash
npm run check
```

### Run Tests
```bash
npm test
```

## How It Works

1. **Logs in** to PIO website using your credentials
2. **Navigates** to your specific application (ID: 223199)
3. **Extracts data** including:
   - Application number and dates
   - Current status and stage
   - Case handler information
   - Communications and documents
4. **Compares** with previous data snapshots
5. **Notifies** you of specific changes via macOS notifications

## Data Storage

The tool saves data snapshots as JSON files in the `data/` directory:
- Each run creates a timestamped file
- Previous data is automatically compared
- Only meaningful changes trigger notifications

## Notifications

You'll receive specific notifications about:
- **Status changes**: "Application status changed from X to Y"
- **New documents**: "New communication added"
- **Case updates**: "Case handler changed"
- **Errors**: Any issues during checking

## Automation

Set up automated checking using macOS launchd or cron:

```bash
# Check every hour
0 * * * * cd /path/to/project && npm run check
```

## Project Structure

```
├── pio-checker.js     # Main application
├── test.js           # Test suite
├── package.json      # Dependencies
├── .env             # Credentials (create this)
├── data/            # Data snapshots
└── README.md        # This file
```

## Dependencies

- `puppeteer`: Browser automation
- `dotenv`: Environment variable management
- `node-notifier`: Cross-platform notifications
