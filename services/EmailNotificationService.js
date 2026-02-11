import sendEmail from '../utils/sendEmail.js';
import APP_SETTINGS from '../config/appSettings.js';

class EmailNotificationService {
  static async sendLoginNotification(type, data) {
    const { userName, email, reason, ipAddress, platform, role } = data;
    
    const templates = {
      success: {
        subject: 'Login Success - Saudagar',
        html: `
          <h3>Login Successful</h3>
          <p><strong>User:</strong> ${userName} (${email})</p>
          <p><strong>Role:</strong> ${role}</p>
          <p><strong>IP:</strong> ${ipAddress}</p>
          <p><strong>Platform:</strong> ${platform}</p>
          <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        `
      },
      failed: {
        subject: 'Login Failed - Saudagar',
        html: `
          <h3>Login Failed</h3>
          <p><strong>User:</strong> ${userName || 'Unknown'} (${email})</p>
          <p><strong>Reason:</strong> ${reason}</p>
          <p><strong>IP:</strong> ${ipAddress}</p>
          <p><strong>Platform:</strong> ${platform}</p>
          <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        `
      }
    };

    try {
      await sendEmail({
        email: APP_SETTINGS.EMAIL.ADMIN_NOTIFICATION,
        subject: templates[type].subject,
        html: templates[type].html
      });
    } catch (error) {
      console.error('Email notification error:', error.message);
    }
  }
}

export default EmailNotificationService;
