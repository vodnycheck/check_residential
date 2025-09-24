const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const notifier = require('node-notifier');
const nodemailer = require('nodemailer');
require('dotenv').config();

class PIOChecker {
    constructor() {
        this.dataDir = path.join(__dirname, 'data');
        this.loginUrl = 'https://pio-przybysz.duw.pl/login';
        this.wniosikiUrl = 'https://pio-przybysz.duw.pl/wnioski-przyjete';
        this.login = process.env.LOGIN;
        this.password = process.env.PASSWORD;
        this.elementText = process.env.ELEMENT_TEXT;

        // Gmail configuration
        this.gmailUser = process.env.mail;
        this.gmailPass = process.env.pass;

        // Ensure data directory exists
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }

        // Validate required environment variables
        if (!this.login || !this.password || !this.elementText) {
            throw new Error('Missing required environment variables: LOGIN, PASSWORD, or ELEMENT_TEXT');
        }

        if (!this.gmailUser || !this.gmailPass) {
            console.warn('Warning: Gmail credentials not found. Email notifications will be disabled.');
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

    async scrapeData() {
        let browser = null;
        let retries = 3;

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                console.log(`Attempt ${attempt}/${retries}: Launching browser...`);

                browser = await puppeteer.launch({
                    headless: false,
                    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
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

                const linkFound = await page.evaluate((elementText) => {
                    const links = Array.from(document.querySelectorAll('a'));
                    const targetLink = links.find(link =>
                        link.textContent.includes(elementText) ||
                        link.getAttribute('href')?.includes(elementText)
                    );
                    if (targetLink) {
                        console.log('Found target link, clicking...');
                        targetLink.click();
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
                            text: link.textContent.trim(),
                            href: link.getAttribute('href')
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
                    const tableResults = [];

                    tables.forEach((table, index) => {
                        const rows = [];
                        const tableRows = table.querySelectorAll('tr');

                        tableRows.forEach(row => {
                            const cells = [];
                            const tableCells = row.querySelectorAll('td, th');
                            tableCells.forEach(cell => {
                                cells.push(cell.innerText.trim());
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

                const scrapedData = {
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
                console.log(`❌ Attempt ${attempt} failed:`, error.message);

                if (attempt === retries) {
                    throw new Error(`Failed to scrape data after ${retries} attempts: ${error.message}`);
                }

                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, 5000));
            } finally {
                if (browser) {
                    try {
                        await browser.close();
                    } catch (e) {
                        console.log('Warning: Error closing browser:', e.message);
                    }
                }
            }
        }
    }

    getLatestDataFile() {
        if (!fs.existsSync(this.dataDir)) {
            return null;
        }

        const files = fs.readdirSync(this.dataDir)
            .filter(file => file.startsWith('szczegoly-wniosku_') && file.endsWith('.json'))
            .sort()
            .reverse();

        return files.length > 0 ? path.join(this.dataDir, files[0]) : null;
    }

    saveData(data) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `szczegoly-wniosku_${timestamp}.json`;
        const filepath = path.join(this.dataDir, filename);

        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
        console.log(`Data saved to: ${filename}`);
        return filepath;
    }

    compareData(oldData, newData) {
        const changes = [];

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

    sendNotification(title, message) {
        notifier.notify({
            title: title,
            message: message,
            sound: true,
            wait: false
        });
    }

    async sendEmail(subject, message, changes = null, previousData = null, currentData = null) {
        if (!this.mailTransporter) {
            console.log('Email notifications disabled - Gmail credentials not configured');
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
            subject: subject,
            html: emailContent
        };

        try {
            const info = await this.mailTransporter.sendMail(mailOptions);
            console.log('Email sent successfully: ' + info.response);
        } catch (error) {
            console.log('Error sending email:', error);
        }
    }

    createDetailedEmailContent(changes, previousData, currentData) {
        const timestamp = new Date().toLocaleString();

        let html = `
            <h2>PIO Application Status Update</h2>
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
            <p><em>This is an automated notification from PIO Checker.</em></p>
        `;

        return html;
    }

    formatTablesForEmail(tables) {
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

    async run() {
        try {
            console.log('Starting PIO website check...');

            // Get latest data file
            const latestFile = this.getLatestDataFile();
            let previousData = null;

            if (latestFile) {
                console.log(`Found previous data: ${path.basename(latestFile)}`);
                previousData = JSON.parse(fs.readFileSync(latestFile, 'utf8'));
            } else {
                console.log('No previous data found - this is the first run');
            }

            // Scrape current data
            const currentData = await this.scrapeData();

            // Save current data
            this.saveData(currentData);

            if (!previousData) {
                console.log('✅ First run completed - baseline data saved');
                this.sendNotification(
                    'PIO Checker - First Run',
                    'Baseline data has been saved. Future runs will detect changes.'
                );

                return;
            }

            // Compare data
            const changes = this.compareData(previousData, currentData);

            if (changes.length === 0) {
                console.log('✅ No changes detected');
                this.sendNotification(
                    'PIO Checker - No Changes',
                    'Your application status remains unchanged.'
                );
            } else {
                console.log('🔔 Changes detected:');
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
            console.error('Error during check:', error);
            this.sendNotification(
                'PIO Checker - Error',
                `An error occurred: ${error.message}`
            );

            // Send error email
            await this.sendEmail(
                'PIO Checker - Error Occurred',
                `<h2>PIO Checker - Error Report</h2>
                 <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                 <p><strong>Error:</strong> ${error.message}</p>
                 <p>The PIO checker encountered an error while trying to check your application status.</p>
                 <p>Please check the application manually or review the system logs.</p>
                 <p><em>This is an automated notification from PIO Checker.</em></p>`
            );
        }
    }
}

// Run the checker
if (require.main === module) {
    const checker = new PIOChecker();
    checker.run();
}

module.exports = PIOChecker;
