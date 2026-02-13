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
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: false,
      family: 4, // Force IPv4
      auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    const message = {
      from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
      to: options.email,
      subject: options.subject,
      html: options.html || options.message
    };

    console.log('Email message:', message);
    const info = await transporter.sendMail(message);
    console.log('✅ Email sent successfully:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Email send error:', error.message);
    console.error('Error details:', error);
    return false;
  }
};

export default sendEmail;