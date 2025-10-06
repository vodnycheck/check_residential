// Quick timezone test script
const now = new Date();

console.log('=== Timezone Information ===');
console.log('System Timezone:', Intl.DateTimeFormat().resolvedOptions().timeZone);
console.log('Current Local Time:', now.toLocaleString());
console.log('Current UTC Time:', now.toISOString());
console.log('Hours (local):', now.getHours());
console.log('Minutes (local):', now.getMinutes());

console.log('\n=== Testing Cron Expression ===');
// Test cron expression for current time + 1 minute
const testMinute = (now.getMinutes() + 1) % 60;
const testHour = now.getHours();
const testDay = now.getDay(); // 0=Sunday, 1=Monday, etc.

console.log(`For a job to run in 1 minute, use: ${testMinute} ${testHour} * * ${testDay}`);
console.log(`Next trigger: ${testHour}:${testMinute.toString().padStart(2, '0')}`);

// Show what 16:52 would look like
console.log('\n=== Example: Saturday at 16:52 ===');
console.log('Cron expression: 52 16 * * 6');
console.log('This means: minute=52, hour=16 (4:52 PM), day=6 (Saturday)');
