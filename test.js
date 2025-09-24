const PIOChecker = require('./pio-checker');
const fs = require('fs');
const path = require('path');

class TestPIOChecker extends PIOChecker {
    // Override scrapeData to simulate website data without actually scraping
    async scrapeData() {
        console.log('🧪 Simulating website data for testing...');

        // Simulate realistic PIO application data
        return {
            mainText: `Wniosek o udzielenie cudzoziemcowi zezwolenia na pobyt czasowy
Numer wniosku: ${this.elementText}
Data przyjęcia wniosku: 20.12.2024
Etap realizacji: Zakończenie postępowania
Sprawę prowadzi: Anna Kovalska
Status: W trakcie rozpatrywania
Uwagi: Wniosek kompletny, oczekuje na decyzję`,
            fields: {
                tables: [
                    [
                        ["Numer wniosku", this.elementText],
                        ["Data przyjęcia wniosku:", "20.12.2024"],
                        ["Etap realizacji:", "Zakończenie postępowania"],
                        ["Sprawę prowadzi:", "Anna Kovalska"],
                        ["Status:", "W trakcie rozpatrywania"]
                    ]
                ],
                numbers: [this.elementText, "20.12.2024", "10", "01.07.2025", "159", "25.07.2025"]
            },
            url: `https://pio-przybysz.duw.pl/szczegoly-wniosku/${this.elementText}`,
            timestamp: new Date().toISOString(),
            elementText: this.elementText
        };
    }
}

async function runTest() {
    console.log('🚀 Testing PIO Checker with simulated data...\n');

    const checker = new TestPIOChecker();

    // Clear any existing data for clean test
    const dataDir = path.join(__dirname, 'data');
    if (fs.existsSync(dataDir)) {
        const files = fs.readdirSync(dataDir);
        files.forEach(file => {
            fs.unlinkSync(path.join(dataDir, file));
        });
        console.log('🧹 Cleared existing data files\n');
    }

    console.log('=== FIRST RUN TEST ===');
    await checker.run();

    console.log('\n=== SECOND RUN TEST (No Changes) ===');
    await checker.run();

    console.log('\n✅ Test completed successfully!');
}

if (require.main === module) {
    runTest().catch(console.error);
}

module.exports = TestPIOChecker;
