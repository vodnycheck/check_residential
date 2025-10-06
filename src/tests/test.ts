import { PIOChecker, MultiAccountChecker } from '../pio-checker';

// Simple test to verify TypeScript compilation and basic functionality
async function runTests(): Promise<void> {
    console.log('Running TypeScript tests...');

    try {
        // Test 1: Verify MultiAccountChecker can be instantiated
        console.log('Test 1: Creating MultiAccountChecker instance...');
        const multiChecker = new MultiAccountChecker();
        console.log('✅ MultiAccountChecker created successfully');

        // Test 2: Verify AccountConfig interface works
        console.log('Test 2: Testing AccountConfig interface...');
        const testConfig = {
            login: 'test@example.com',
            password: 'testpass',
            elementText: 'test-element'
        };

        const checker = new PIOChecker(testConfig);
        console.log('✅ PIOChecker created with typed config');

        console.log('All tests passed! TypeScript setup is working correctly.');

    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    runTests().catch(console.error);
}

export { runTests };
