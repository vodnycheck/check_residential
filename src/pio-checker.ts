import * as puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import notifier from 'node-notifier';
import * as nodemailer from 'nodemailer';
import * as dotenv from 'dotenv';

dotenv.config();

// Get the correct data directory - always use project directory for consistency
function getDataDirectory(): string {
    return process.cwd();
}

interface AccountConfig {
    login: string;
    password: string;
    elementText: string;
    headless?: boolean;
}

interface TableData {
    tables: string[][][];
    numbers: string[];
}

interface ScrapedData {
    mainText: string;
    fields: TableData;
    url: string;
    timestamp: string;
    elementText: string;
}

interface LinkInfo {
    text: string;
    href: string | null;
}

class PIOChecker {
    private accountId: string;
    private dataDir: string;
    private readonly loginUrl: string = 'https://pio-przybysz.duw.pl/login';
    private readonly wniosikiUrl: string = 'https://pio-przybysz.duw.pl/wnioski-przyjete';
    private login: string;
    private password: string;
    private elementText: string;
    private headless: boolean;
    private gmailUser: string | undefined;
    private gmailPass: string | undefined;
    private mailTransporter: nodemailer.Transporter | null = null;

    constructor(accountConfig: AccountConfig) {
        this.accountId = accountConfig.login; // Use login as account ID
        // Use appropriate data directory based on context (Electron or Node)
        this.dataDir = path.join(getDataDirectory(), 'data', this.accountId);
        this.login = accountConfig.login;
        this.password = accountConfig.password;
        this.elementText = accountConfig.elementText;
        this.headless = accountConfig.headless !== undefined ? accountConfig.headless : true;

        // Gmail configuration from environment variables
        this.gmailUser = process.env.mail;
        this.gmailPass = process.env.pass;

        // Ensure data directory exists
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }

        // Validate required configuration
        if (!this.login || !this.password || !this.elementText) {
            throw new Error(`Missing required configuration for account ${this.accountId}: login, password, or elementText`);
        }

        if (!this.gmailUser || !this.gmailPass) {
            console.warn(`Warning: Gmail credentials not found in environment variables. Email notifications will be disabled.`);
        }

        // Configure Gmail transporter
        this.mailTransporter = null;
        if (this.gmailUser && this.gmailPass) {
            this.mailTransporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: this.gmailUser,
                    pass: this.gmailPass
                }
            });
        }
    }

    async scrapeData(): Promise<ScrapedData> {
        let browser: puppeteer.Browser | null = null;
        let retries = 3;

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                console.log(`Attempt ${attempt}/${retries}: Launching browser...`);

                browser = await puppeteer.launch({
                    headless: this.headless,
                    // Using Puppeteer's bundled Chromium instead of system Chrome
                    timeout: 0,
                    protocolTimeout: 240000,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-gpu',
                        '--disable-web-security',
                        '--disable-features=VizDisplayCompositor'
                    ]
                });

                const page = await browser.newPage();
                await page.setDefaultTimeout(60000);
                await page.setDefaultNavigationTimeout(60000);
                await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

                // Step 1: Go to login page
                console.log('Navigating to login page...');
                await page.goto(this.loginUrl, {
                    waitUntil: 'domcontentloaded',
                    timeout: 60000
                });

                console.log('Login page loaded, looking for login form...');

                // Step 2: Login using credentials from .env file
                console.log('Filling login credentials...');

                // Use the correct selectors for the login form
                const usernameSelector = 'input[formcontrolname="username"]';
                const passwordSelector = 'input[formcontrolname="pass"]';
                const submitSelector = 'button.btn-primary';

                // Wait for login form to be available and fill it
                await page.waitForSelector(usernameSelector, { timeout: 10000 });
                const loginField = await page.$(usernameSelector);
                if (loginField) {
                    await loginField.type(this.login);
                    console.log('Login field filled');
                }

                await page.waitForSelector(passwordSelector, { timeout: 10000 });
                const passwordField = await page.$(passwordSelector);
                if (passwordField) {
                    await passwordField.type(this.password);
                    console.log('Password field filled');
                }

                // Find and click submit button
                console.log('Submitting login form...');
                const submitButton = await page.$(submitSelector);
                if (submitButton) {
                    await Promise.all([
                        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
                        submitButton.click()
                    ]);
                    console.log('Login form submitted');
                } else {
                    throw new Error('Could not find submit button');
                }

                // Verify login was successful
                await page.waitForTimeout(2000);
                const currentUrl = page.url();
                console.log(`Current URL after login: ${currentUrl}`);

                // Step 3: Go to wnioski-przyjete page
                console.log('Navigating to applications page...');
                await page.goto(this.wniosikiUrl, {
                    waitUntil: 'domcontentloaded',
                    timeout: 60000
                });

                console.log('Applications page loaded');

                // Step 4: Find link with ELEMENT_TEXT from .env file
                console.log(`Looking for element with text: ${this.elementText}`);

                // Wait for page content to load
                await page.waitForTimeout(3000);

                const linkFound = await page.evaluate((elementText: string) => {
                    const links = Array.from(document.querySelectorAll('a'));
                    const targetLink = links.find(link =>
                        (link as HTMLAnchorElement).textContent?.includes(elementText) ||
                        (link as HTMLAnchorElement).getAttribute('href')?.includes(elementText)
                    );
                    if (targetLink) {
                        console.log('Found target link, clicking...');
                        (targetLink as HTMLAnchorElement).click();
                        return true;
                    }
                    console.log('Target link not found');
                    return false;
                }, this.elementText);

                if (!linkFound) {
                    // Debug: Let's see what links are available
                    const availableLinks = await page.evaluate(() => {
                        const links = Array.from(document.querySelectorAll('a'));
                        return links.map(link => ({
                            text: (link as HTMLAnchorElement).textContent?.trim() || '',
                            href: (link as HTMLAnchorElement).getAttribute('href')
                        })).filter(link => link.text || link.href);
                    });
                    console.log('Available links:', availableLinks.slice(0, 10));
                    throw new Error(`Could not find link containing text: ${this.elementText}`);
                }

                // Wait for navigation to the target page
                console.log('Waiting for target page to load...');

                // Instead of waiting for navigation event, check URL directly
                let targetPageLoaded = false;
                for (let i = 0; i < 10; i++) {
                    await page.waitForTimeout(1000);
                    const currentUrl = page.url();
                    console.log(`Current URL: ${currentUrl}`);

                    if (currentUrl.includes('https://pio-przybysz.duw.pl/szczegoly-wniosku')) {
                        console.log('Target page detected by URL!');
                        targetPageLoaded = true;
                        break;
                    }
                }

                if (!targetPageLoaded) {
                    throw new Error('Target page did not load within expected time');
                }

                console.log('Target page loaded, extracting data...');

                // Step 5: Take the data from the opened page
                const mainText = await page.evaluate(() => {
                    return document.body ? document.body.innerText || '' : '';
                });

                // Extract table data
                const tableData = await page.evaluate(() => {
                    const tables = document.querySelectorAll('table');
                    const tableResults: string[][][] = [];

                    tables.forEach((table) => {
                        const rows: string[][] = [];
                        const tableRows = table.querySelectorAll('tr');

                        tableRows.forEach(row => {
                            const cells: string[] = [];
                            const tableCells = row.querySelectorAll('td, th');
                            tableCells.forEach(cell => {
                                cells.push((cell as HTMLElement).innerText.trim());
                            });
                            if (cells.length > 0) {
                                rows.push(cells);
                            }
                        });

                        if (rows.length > 0) {
                            tableResults.push(rows);
                        }
                    });

                    return tableResults;
                });

                // Extract numbers (application numbers, dates, etc.)
                const numbers = mainText.match(/\d+[\.\d]*(?:\.\d+\.\d+)?/g) || [];

                const scrapedData: ScrapedData = {
                    mainText: mainText.trim(),
                    fields: {
                        tables: tableData,
                        numbers: numbers
                    },
                    url: page.url(),
                    timestamp: new Date().toISOString(),
                    elementText: this.elementText
                };

                console.log('✅ Data scraped successfully');
                return scrapedData;

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.log(`❌ Attempt ${attempt} failed:`, errorMessage);

                if (attempt === retries) {
                    throw new Error(`Failed to scrape data after ${retries} attempts: ${errorMessage}`);
                }

                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, 5000));
            } finally {
                if (browser) {
                    try {
                        await browser.close();
                    } catch (e) {
                        const errorMessage = e instanceof Error ? e.message : String(e);
                        console.log('Warning: Error closing browser:', errorMessage);
                    }
                }
            }
        }

        throw new Error('Failed to scrape data after all retries');
    }

    getLatestDataFile(): string | null {
        if (!fs.existsSync(this.dataDir)) {
            return null;
        }

        const files = fs.readdirSync(this.dataDir)
            .filter(file => file.startsWith('szczegoly-wniosku_') && file.endsWith('.json'))
            .sort()
            .reverse();

        return files.length > 0 ? path.join(this.dataDir, files[0]!) : null;
    }

    saveData(data: ScrapedData): string {
        const now = new Date();
        // Format as local time: YYYY-MM-DDTHH-MM-SS
        const timestamp = now.getFullYear() + '-' +
            String(now.getMonth() + 1).padStart(2, '0') + '-' +
            String(now.getDate()).padStart(2, '0') + 'T' +
            String(now.getHours()).padStart(2, '0') + '-' +
            String(now.getMinutes()).padStart(2, '0') + '-' +
            String(now.getSeconds()).padStart(2, '0');
        const filename = `szczegoly-wniosku_${timestamp}.json`;
        const filepath = path.join(this.dataDir, filename);

        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
        console.log(`[${this.accountId}] Data saved to: ${filename}`);
        return filepath;
    }

    compareData(oldData: ScrapedData, newData: ScrapedData): string[] {
        const changes: string[] = [];

        // Compare main text
        if (oldData.mainText !== newData.mainText) {
            changes.push('Main content has changed');
        }

        // Compare tables
        const oldTables = JSON.stringify(oldData.fields.tables || []);
        const newTables = JSON.stringify(newData.fields.tables || []);

        if (oldTables !== newTables) {
            changes.push('Table data has changed');
        }

        // Compare numbers
        const oldNumbers = JSON.stringify(oldData.fields.numbers || []);
        const newNumbers = JSON.stringify(newData.fields.numbers || []);

        if (oldNumbers !== newNumbers) {
            changes.push('Numbers/dates have changed');
        }

        return changes;
    }

    sendNotification(title: string, message: string): void {
        notifier.notify({
            title: `${title} - ${this.accountId}`,
            message: message,
            sound: true,
            wait: false
        });
    }

    async sendEmail(
        subject: string,
        message: string,
        changes: string[] | null = null,
        previousData: ScrapedData | null = null,
        currentData: ScrapedData | null = null
    ): Promise<void> {
        if (!this.mailTransporter) {
            console.log(`[${this.accountId}] Email notifications disabled - Gmail credentials not configured`);
            return;
        }

        let emailContent = message;

        // If changes are detected, create a detailed email
        if (changes && changes.length > 0 && previousData && currentData) {
            emailContent = this.createDetailedEmailContent(changes, previousData, currentData);
        }

        const mailOptions = {
            from: this.gmailUser,
            to: this.gmailUser,
            subject: `${subject} - Account: ${this.accountId}`,
            html: emailContent
        };

        try {
            const info = await this.mailTransporter.sendMail(mailOptions);
            console.log(`[${this.accountId}] Email sent successfully: ` + info.response);
        } catch (error) {
            console.log(`[${this.accountId}] Error sending email:`, error);
        }
    }

    createDetailedEmailContent(changes: string[], previousData: ScrapedData, currentData: ScrapedData): string {
        const timestamp = new Date().toLocaleString();

        let html = `
            <h2>PIO Application Status Update</h2>
            <p><strong>Account:</strong> ${this.accountId}</p>
            <p><strong>Time:</strong> ${timestamp}</p>
            <p><strong>Application Number:</strong> ${this.elementText}</p>
            <p><strong>Changes Detected:</strong></p>
            <ul>
        `;

        changes.forEach(change => {
            html += `<li>${change}</li>`;
        });

        html += `</ul>`;

        // Add detailed comparison if tables changed
        if (changes.includes('Table data has changed')) {
            html += `<h3>Table Changes:</h3>`;
            html += `<h4>Previous Data:</h4>`;
            html += this.formatTablesForEmail(previousData.fields.tables || []);
            html += `<h4>Current Data:</h4>`;
            html += this.formatTablesForEmail(currentData.fields.tables || []);
        }

        // Add number changes if detected
        if (changes.includes('Numbers/dates have changed')) {
            html += `<h3>Number/Date Changes:</h3>`;
            html += `<p><strong>Previous:</strong> ${(previousData.fields.numbers || []).join(', ')}</p>`;
            html += `<p><strong>Current:</strong> ${(currentData.fields.numbers || []).join(', ')}</p>`;
        }

        html += `
            <hr>
            <p><strong>Application URL:</strong> <a href="${currentData.url}">${currentData.url}</a></p>
            <p><em>This is an automated notification from PIO Checker for account ${this.accountId}.</em></p>
        `;

        return html;
    }

    formatTablesForEmail(tables: string[][][]): string {
        if (!tables || tables.length === 0) {
            return '<p>No table data available</p>';
        }

        let html = '';
        tables.forEach((table, index) => {
            html += `<h5>Table ${index + 1}:</h5>`;
            html += '<table border="1" style="border-collapse: collapse; margin-bottom: 10px;">';

            table.forEach((row, rowIndex) => {
                html += '<tr>';
                row.forEach(cell => {
                    const tag = rowIndex === 0 ? 'th' : 'td';
                    html += `<${tag} style="padding: 5px; border: 1px solid #ccc;">${cell}</${tag}>`;
                });
                html += '</tr>';
            });

            html += '</table>';
        });

        return html;
    }

    async run(): Promise<void> {
        try {
            console.log(`[${this.accountId}] Starting PIO website check...`);

            // Get latest data file
            const latestFile = this.getLatestDataFile();
            let previousData: ScrapedData | null = null;

            if (latestFile) {
                console.log(`[${this.accountId}] Found previous data: ${path.basename(latestFile)}`);
                previousData = JSON.parse(fs.readFileSync(latestFile, 'utf8'));
            } else {
                console.log(`[${this.accountId}] No previous data found - this is the first run`);
            }

            // Scrape current data
            const currentData = await this.scrapeData();

            // Save current data
            this.saveData(currentData);

            if (!previousData) {
                console.log(`[${this.accountId}] ✅ First run completed - baseline data saved`);
                this.sendNotification(
                    'PIO Checker - First Run',
                    'Baseline data has been saved. Future runs will detect changes.'
                );

                return;
            }

            // Compare data
            const changes = this.compareData(previousData, currentData);

            if (changes.length === 0) {
                console.log(`[${this.accountId}] ✅ No changes detected`);
                this.sendNotification(
                    'PIO Checker - No Changes',
                    'Your application status remains unchanged.'
                );
            } else {
                console.log(`[${this.accountId}] 🔔 Changes detected:`);
                changes.forEach(change => console.log(`  - ${change}`));

                this.sendNotification(
                    'PIO Checker - Changes Detected!',
                    `Changes found: ${changes.join(', ')}`
                );

                // Send detailed email report
                await this.sendEmail(
                    'PIO Checker - Changes Detected!',
                    'Changes have been detected in your application status.',
                    changes,
                    previousData,
                    currentData
                );
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[${this.accountId}] Error during check:`, error);
            this.sendNotification(
                'PIO Checker - Error',
                `An error occurred: ${errorMessage}`
            );

            // Send error email
            await this.sendEmail(
                'PIO Checker - Error Occurred',
                `<h2>PIO Checker - Error Report</h2>
                 <p><strong>Account:</strong> ${this.accountId}</p>
                 <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                 <p><strong>Error:</strong> ${errorMessage}</p>
                 <p>The PIO checker encountered an error while trying to check your application status.</p>
                 <p>Please check the application manually or review the system logs.</p>
                 <p><em>This is an automated notification from PIO Checker.</em></p>`
            );
        }
    }
}

class MultiAccountChecker {
    private accounts: AccountConfig[];
    private headless: boolean;

    constructor(headless: boolean = true) {
        this.headless = headless;
        this.accounts = this.loadAccountsConfig();
    }

    loadAccountsConfig() {
        // Use appropriate directory based on context (Electron or Node)
        const accountsFile = path.join(getDataDirectory(), 'accounts.json');
        if (!fs.existsSync(accountsFile)) {
            throw new Error('accounts.json file not found. Please create it with your account configurations.');
        }

        console.log('Loading accounts from accounts.json...');
        const accounts = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));

        if (!Array.isArray(accounts) || accounts.length === 0) {
            throw new Error('accounts.json must contain an array of account configurations.');
        }

        // Inject headless setting into all accounts
        return accounts.map(acc => ({
            ...acc,
            headless: this.headless
        }));
    }

    async runAll() {
        console.log(`Starting checks for ${this.accounts.length} account(s)...`);

        const results: Array<{accountId: string, status: string, error?: string}> = [];

        for (const accountConfig of this.accounts) {
            try {
                console.log(`\n--- Checking account: ${accountConfig.login} ---`);
                const checker = new PIOChecker(accountConfig);
                await checker.run();
                results.push({ accountId: accountConfig.login, status: 'success' });

                // Add delay between accounts to avoid overwhelming the server
                if (this.accounts.length > 1) {
                    console.log('Waiting 3 seconds before next account...');
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`Failed to check account ${accountConfig.login}:`, error);
                results.push({ accountId: accountConfig.login, status: 'error', error: errorMessage });
            }
        }

        console.log('\n--- Summary ---');
        results.forEach(result => {
            const status = result.status === 'success' ? '✅' : '❌';
            console.log(`${status} ${result.accountId}: ${result.status}`);
            if (result.error) {
                console.log(`   Error: ${result.error}`);
            }
        });

        return results;
    }

    async runSingle(accountId: string) {
        const accountConfig = this.accounts.find(acc => acc.login === accountId);
        if (!accountConfig) {
            throw new Error(`Account with login '${accountId}' not found`);
        }

        console.log(`Checking single account: ${accountId}`);
        const checker = new PIOChecker(accountConfig);
        await checker.run();
    }
}

// Run the checker
if (require.main === module) {
    const multiChecker = new MultiAccountChecker();

    // Check if a specific account ID was provided as command line argument
    const accountId = process.argv[2];

    if (accountId) {
        multiChecker.runSingle(accountId).catch(console.error);
    } else {
        multiChecker.runAll().catch(console.error);
    }
}

export { PIOChecker, MultiAccountChecker };
