export const APP_SETTINGS = {
  // JWT Settings
  JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key',
  JWT_EXPIRES_IN: '30d',
  JWT_EXPIRES_IN_SECONDS: 2592000, // 30 days


  // Is Production Database
   IS_PROD_MOD:true,


  // Response Messages
  MESSAGES: {
    LOGIN_SUCCESS: 'Login successful',
    LOGIN_FAILED: 'Invalid email or password',
    ACCOUNT_INACTIVE: 'Your account is inactive. Please contact administrator',
    PLATFORM_ACCESS_DENIED: 'You are not allowed to login on this platform',
    VALIDATION_ERROR: 'Validation error',
    INTERNAL_ERROR: 'Internal server error',
    LOGOUT_SUCCESS: 'Logout successful',
    USER_CREATED: 'User created successfully',
    USER_UPDATED: 'User updated successfully',
    USER_DELETED: 'User deleted successfully'
  },

  // Email Settings
  EMAIL: {
    FROM: process.env.EMAIL_FROM || 'noreply@saudagar.com',
    SUPPORT: process.env.EMAIL_SUPPORT || 'support@saudagar.com',
    ADMIN_NOTIFICATION: 'prasad.s@siddhi-tech.com'
  },

  // Pagination
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 100
  }
};

export default APP_SETTINGS;
