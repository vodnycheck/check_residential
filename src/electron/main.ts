import { app, BrowserWindow, ipcMain, Tray, Menu, shell, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as cron from 'node-cron';
import { MultiAccountChecker } from '../pio-checker';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let cronJob: cron.ScheduledTask | null = null;
let isChecking = false;

// Path to accounts.json - use project directory for consistency
const accountsPath = path.join(process.cwd(), 'accounts.json');
const settingsPath = path.join(process.cwd(), 'settings.json');
const logsDir = path.join(process.cwd(), 'logs');
const currentLogPath = path.join(logsDir, 'current.log');
const previousLogPath = path.join(logsDir, 'previous.log');

// Initialize logs directory
function initializeLogs() {
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }

    // Rotate logs: current becomes previous
    if (fs.existsSync(currentLogPath)) {
        fs.copyFileSync(currentLogPath, previousLogPath);
        fs.unlinkSync(currentLogPath);
    }

    // Write initial log entry
    writeLog('=== Application Started ===');
    writeLog(`Timestamp: ${new Date().toISOString()}`);
    writeLog(`Project Directory: ${process.cwd()}`);
    writeLog(`Accounts Path: ${accountsPath}`);
    writeLog(`Data Path: ${path.join(process.cwd(), 'data')}`);
    writeLog('===========================\n');
}

// Write log to file and console
function writeLog(message: string, level: 'INFO' | 'ERROR' | 'WARN' = 'INFO') {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${level}] ${message}\n`;

    // Write to console
    console.log(logLine.trim());

    // Write to file
    try {
        fs.appendFileSync(currentLogPath, logLine, 'utf8');
    } catch (error) {
        console.error('Failed to write to log file:', error);
    }
}

// Initialize accounts.json if it doesn't exist
function initializeAccounts() {
    if (!fs.existsSync(accountsPath)) {
        // Create empty accounts.json in project directory
        fs.writeFileSync(accountsPath, '[]', 'utf8');
        writeLog('Created empty accounts.json at: ' + accountsPath);
    }
    writeLog('Accounts file location: ' + accountsPath);
}

interface DaySchedule {
    enabled: boolean;
    time: string; // HH:MM format
}

interface Settings {
    scheduleEnabled: boolean;
    scheduleType?: 'interval' | 'days'; // interval or day-based
    scheduleInterval: number; // in minutes
    scheduleDays?: {
        [key: string]: DaySchedule; // monday, tuesday, etc.
    };
    lastCheck?: string;
    headlessMode?: boolean; // whether to run browser in headless mode
}

// Load or create settings
function loadSettings(): Settings {
    try {
        if (fs.existsSync(settingsPath)) {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            // Set defaults for new properties
            if (!settings.scheduleType) {
                settings.scheduleType = 'days';
            }
            if (!settings.scheduleDays) {
                settings.scheduleDays = {};
            }
            if (settings.headlessMode === undefined) {
                settings.headlessMode = true; // default to headless
            }
            return settings;
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
    return {
        scheduleEnabled: false,
        scheduleType: 'days',
        scheduleInterval: 30, // default 30 minutes
        scheduleDays: {},
        headlessMode: true // default to headless mode
    };
}

function saveSettings(settings: Settings): void {
    try {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    } catch (error) {
        console.error('Error saving settings:', error);
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        // icon: path.join(__dirname, '../../assets/icon.png'), // Optional: add icon later
        title: 'PIO Website Checker'
    });

    // Load the HTML file
    mainWindow.loadFile(path.join(__dirname, '../../public/index.html'));

    mainWindow.on('close', (event) => {
        if (!(global as any).isQuitting) {
            event.preventDefault();
            mainWindow?.hide();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function createTray() {
    // Skip tray for now if icon doesn't exist
    const iconPath = path.join(__dirname, '../../assets/icon.png');
    if (!fs.existsSync(iconPath)) {
        console.log('Tray icon not found, skipping tray creation');
        return;
    }
    tray = new Tray(iconPath);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show App',
            click: () => {
                mainWindow?.show();
            }
        },
        {
            label: 'Check Now',
            click: () => {
                runCheck();
            }
        },
        { type: 'separator' },
        {
            label: 'Exit',
            click: () => {
                (global as any).isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('PIO Website Checker');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
        mainWindow?.show();
    });
}

async function runCheck() {
    if (isChecking) {
        writeLog('Check already in progress', 'WARN');
        return;
    }

    // Check if accounts.json has any accounts
    try {
        const accountsContent = fs.readFileSync(accountsPath, 'utf8');
        const accounts = JSON.parse(accountsContent);
        if (!Array.isArray(accounts) || accounts.length === 0) {
            writeLog('No accounts configured, skipping check', 'WARN');
            mainWindow?.webContents.send('check-status', {
                status: 'error',
                message: 'No accounts configured. Please add accounts in the Accounts tab.',
                timestamp: new Date().toISOString()
            });
            return;
        }
    } catch (error) {
        writeLog('Error reading accounts: ' + (error instanceof Error ? error.message : String(error)), 'ERROR');
        mainWindow?.webContents.send('check-status', {
            status: 'error',
            message: 'Error reading accounts configuration',
            timestamp: new Date().toISOString()
        });
        return;
    }

    isChecking = true;
    const settings = loadSettings();
    const now = new Date();
    settings.lastCheck = now.toISOString();
    writeLog(`Check started at: ${now.toLocaleString()} (UTC: ${now.toISOString()}, Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone})`);
    saveSettings(settings);

    // Send status to renderer
    mainWindow?.webContents.send('check-status', {
        status: 'running',
        message: 'Running check...',
        timestamp: new Date().toISOString()
    });

    try {
        const headlessMode = settings.headlessMode !== undefined ? settings.headlessMode : true;
        writeLog(`Running check with headless mode: ${headlessMode}`);

        const checker = new MultiAccountChecker(headlessMode);
        const results = await checker.runAll();

        writeLog(`Check completed successfully. Results: ${JSON.stringify(results)}`);

        // Send results to renderer
        mainWindow?.webContents.send('check-status', {
            status: 'completed',
            message: 'Check completed successfully',
            results: results,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        writeLog('Check failed: ' + errorMessage, 'ERROR');
        if (error instanceof Error && error.stack) {
            writeLog('Stack trace: ' + error.stack, 'ERROR');
        }

        mainWindow?.webContents.send('check-status', {
            status: 'error',
            message: `Check failed: ${errorMessage}`,
            timestamp: new Date().toISOString()
        });
    } finally {
        isChecking = false;
        writeLog('Check process finished');
    }
}

function setupScheduler(settings: Settings) {
    // Clear existing job if any
    if (cronJob) {
        cronJob.stop();
        cronJob = null;
    }

    if (!settings.scheduleEnabled) {
        writeLog('Scheduler disabled');
        return;
    }

    if (settings.scheduleType === 'interval') {
        const intervalMinutes = settings.scheduleInterval;
        if (intervalMinutes > 0) {
            // Create cron expression for running every N minutes
            const cronExpression = `*/${intervalMinutes} * * * *`;

            cronJob = cron.schedule(cronExpression, () => {
                console.log(`Running scheduled check at ${new Date().toISOString()}`);
                runCheck();
            });

            cronJob.start();
            writeLog(`Scheduler started: checking every ${intervalMinutes} minutes`);
        }
    } else if (settings.scheduleType === 'days' && settings.scheduleDays) {
        // Build cron expressions for each enabled day
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayToCron: { [key: string]: number } = {
            sunday: 0,
            monday: 1,
            tuesday: 2,
            wednesday: 3,
            thursday: 4,
            friday: 5,
            saturday: 6
        };

        const enabledDays = days.filter(day =>
            settings.scheduleDays![day] && settings.scheduleDays![day].enabled
        );

        if (enabledDays.length === 0) {
            writeLog('No days enabled for scheduling', 'WARN');
            return;
        }

        // Create a cron job for each enabled day
        const cronJobs: cron.ScheduledTask[] = [];

        enabledDays.forEach(day => {
            const dayConfig = settings.scheduleDays![day];
            if (!dayConfig) return;

            const [hours, minutes] = dayConfig.time.split(':').map(Number);
            const dayOfWeek = dayToCron[day];

            // Cron format: minute hour * * day-of-week
            const cronExpression = `${minutes} ${hours} * * ${dayOfWeek}`;

            writeLog(`Setting up cron for ${day}: expression="${cronExpression}", time=${dayConfig.time}, current time=${new Date().toLocaleString()}`);

            const job = cron.schedule(cronExpression, () => {
                writeLog(`Running scheduled check for ${day} at ${dayConfig.time} (system time: ${new Date().toLocaleString()}, UTC: ${new Date().toISOString()})`);
                runCheck();
            }, {
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
            });

            job.start();
            cronJobs.push(job);
            writeLog(`✓ Scheduled check for ${day} at ${dayConfig.time} (timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone})`);
        });

        // Store the first job as the main job (for stopping later)
        // In a real app, we'd want to track all jobs
        cronJob = cronJobs[0] || null;
    }
}

// IPC Handlers
ipcMain.handle('get-accounts', async () => {
    try {
        if (fs.existsSync(accountsPath)) {
            const content = fs.readFileSync(accountsPath, 'utf8');
            return { success: true, data: content };
        }
        return { success: true, data: '[]' };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});

ipcMain.handle('save-accounts', async (event, content: string) => {
    try {
        // Validate JSON
        JSON.parse(content);
        fs.writeFileSync(accountsPath, content);
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});

ipcMain.handle('get-settings', async () => {
    return loadSettings();
});

ipcMain.handle('save-settings', async (event, settings: Settings) => {
    saveSettings(settings);

    // Update scheduler
    setupScheduler(settings);

    return { success: true };
});

ipcMain.handle('run-check', async () => {
    runCheck();
    return { success: true };
});

ipcMain.handle('open-data-folder', async () => {
    const dataPath = path.join(process.cwd(), 'data');
    // Create data directory if it doesn't exist
    if (!fs.existsSync(dataPath)) {
        fs.mkdirSync(dataPath, { recursive: true });
    }
    shell.openPath(dataPath);
    return { success: true };
});

ipcMain.handle('open-logs-folder', async () => {
    shell.openPath(logsDir);
    return { success: true };
});

ipcMain.handle('get-logs', async () => {
    try {
        const dataDir = path.join(process.cwd(), 'data');
        const logs: any[] = [];

        if (fs.existsSync(dataDir)) {
            const accounts = fs.readdirSync(dataDir);
            for (const account of accounts) {
                const accountDir = path.join(dataDir, account);
                if (fs.statSync(accountDir).isDirectory()) {
                    const files = fs.readdirSync(accountDir)
                        .filter(f => f.endsWith('.json'))
                        .sort()
                        .reverse()
                        .slice(0, 10); // Last 10 checks per account

                    for (const file of files) {
                        const content = JSON.parse(fs.readFileSync(path.join(accountDir, file), 'utf8'));
                        logs.push({
                            account,
                            filename: file,
                            timestamp: content.timestamp,
                            url: content.url
                        });
                    }
                }
            }
        }

        return { success: true, data: logs };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});

// App event handlers
app.whenReady().then(() => {
    // Initialize logs first
    initializeLogs();

    // Initialize accounts.json if it doesn't exist
    initializeAccounts();

    createWindow();
    createTray();

    // Load settings and start scheduler if enabled
    const settings = loadSettings();
    setupScheduler(settings);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

// Store quitting state in global
(global as any).isQuitting = false;