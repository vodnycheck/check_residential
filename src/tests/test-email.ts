// Test script for email notifications
import * as nodemailer from 'nodemailer';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testEmail(): Promise<void> {
    const gmailUser = process.env.mail;
    const gmailPass = process.env.pass;

    if (!gmailUser || !gmailPass) {
        console.error('❌ Error: Gmail credentials not found in .env file');
        console.error('Please ensure your .env file contains:');
        console.error('  mail=your-gmail@gmail.com');
        console.error('  pass=your-app-password');
        process.exit(1);
    }

    console.log('📧 Testing email notification...');
    console.log(`Using Gmail account: ${gmailUser}`);

    // Create transporter
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: gmailUser,
            pass: gmailPass
        }
    });

    // Prepare test email
    const timestamp = new Date().toLocaleString();
    const htmlContent = `
        <h2>PIO Checker - Email Test</h2>
        <p><strong>Test Time:</strong> ${timestamp}</p>
        <p>This is a test email from the PIO Website Checker.</p>
        <p>If you're receiving this email, your email notifications are configured correctly! ✅</p>

        <h3>Configuration Details:</h3>
        <ul>
            <li><strong>Gmail Account:</strong> ${gmailUser}</li>
            <li><strong>SMTP Service:</strong> Gmail</li>
            <li><strong>Status:</strong> Working</li>
        </ul>

        <hr>
        <p><em>This is a test notification from PIO Website Checker.</em></p>
    `;

    const mailOptions: nodemailer.SendMailOptions = {
        from: gmailUser,
        to: gmailUser,
        subject: `PIO Checker - Test Email (${timestamp})`,
        html: htmlContent
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Email sent successfully!');
        console.log('Message ID:', info.messageId);
        console.log('Response:', info.response);
        console.log('\n📬 Check your inbox for the test email.');
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('❌ Error sending email:', errorMessage);
        console.error('\nTroubleshooting tips:');
        console.error('1. Ensure you\'re using a Gmail App Password (not your regular password)');
        console.error('2. Enable 2-factor authentication on your Gmail account');
        console.error('3. Generate an App Password at: https://myaccount.google.com/apppasswords');
        console.error('4. Check that your .env file is properly formatted');
    }
}

// Run the test
testEmail().catch(console.error);