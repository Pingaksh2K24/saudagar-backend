import pkg from 'nodemailer';
const { createTransport } = pkg;

const sendEmail = async (options) => {
  try {
    console.log('=== EMAIL SEND ATTEMPT ===');
    console.log('SMTP Config:', {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      user: process.env.SMTP_EMAIL,
      from: process.env.FROM_EMAIL
    });
    
    const transporter = createTransport({
      host: '74.125.130.108', // Gmail SMTP IPv4 address
      port: 587,
      secure: false,
      auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD
      },
      tls: {
        rejectUnauthorized: false
      },
      connectionTimeout: 10000,
      greetingTimeout: 5000,
      socketTimeout: 10000
    });

    const message = {
      from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
      to: options.email,
      subject: options.subject,
      html: options.html || options.message
    };

    console.log('Email message to:', options.email);
    const info = await transporter.sendMail(message);
    console.log('✅ Email sent successfully:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Email send error:', error.message);
    console.error('Error code:', error.code);
    return false;
  }
};

export default sendEmail;