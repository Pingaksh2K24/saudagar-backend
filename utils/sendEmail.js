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
        rejectUnauthorized: false,
        ciphers: 'SSLv3'
      },
      family: 4, // Force IPv4
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      pool: true,
      maxConnections: 1
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
    console.error('Error stack:', error.stack);
    return false;
  }
};

export default sendEmail;