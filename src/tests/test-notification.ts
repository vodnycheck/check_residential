// Test script for system notifications (Windows/macOS/Linux)
import notifier from 'node-notifier';
import * as os from 'os';

console.log('🔔 System Notification Test');
console.log('============================');
console.log(`Platform: ${os.platform()}`);
console.log(`OS Type: ${os.type()}`);
console.log(`OS Release: ${os.release()}`);
console.log('');

interface NotificationTest {
    title: string;
    message: string;
    delay: number;
    description: string;
}

const tests: NotificationTest[] = [
    {
        title: 'PIO Checker - Test 1',
        message: 'Basic notification test',
        delay: 0,
        description: 'Test 1: Sending basic notification...'
    },
    {
        title: 'PIO Checker - Test 2',
        message: 'This is a longer notification message to test how the system handles multiple lines of text in the notification.',
        delay: 2000,
        description: 'Test 2: Sending detailed notification...'
    },
    {
        title: 'PIO Checker - Changes Detected!',
        message: 'Your application status has changed. Check your email for details.',
        delay: 4000,
        description: 'Test 3: Simulating change detection notification...'
    },
    {
        title: 'PIO Checker - Error',
        message: 'Failed to check application status. Please review logs.',
        delay: 6000,
        description: 'Test 4: Simulating error notification...'
    },
    {
        title: 'PIO Checker - Check Complete',
        message: 'No changes detected in your application.',
        delay: 8000,
        description: 'Test 5: Simulating success notification...'
    }
];

function sendNotification(test: NotificationTest): void {
    console.log(test.description);
    notifier.notify({
        title: test.title,
        message: test.message,
        sound: true,
        wait: false
    });
}

// Send notifications with delays
console.log('Sending 5 test notifications with 2-second intervals...');
console.log('Please check your system notification area.\n');

tests.forEach((test) => {
    setTimeout(() => {
        sendNotification(test);

        // Show completion message after the last test
        if (test === tests[tests.length - 1]) {
            setTimeout(() => {
                console.log('\n✅ All test notifications sent!');
                console.log('You should have seen 5 different notifications.');
                console.log('\nNotification support status:');
                console.log('- Windows 10/11: Toast notifications ✅');
                console.log('- Windows 7/8: Balloon notifications ✅');
                console.log('- macOS: Native notifications ✅');
                console.log('- Linux: notify-send notifications ✅');
            }, 500);
        }
    }, test.delay);
});