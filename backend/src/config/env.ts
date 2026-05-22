function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: requireEnv('DATABASE_URL'),
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // Base URL of the web app that hosts the public /reset-password page.
  // Password-reset emails link here. Defaults to the local admin dev server.
  webAppUrl: process.env.WEB_APP_URL || 'http://localhost:3000',

  jwt: {
    accessSecret: requireEnv('JWT_ACCESS_SECRET'),
    refreshSecret: requireEnv('JWT_REFRESH_SECRET'),
    accessExpiresIn: '15m',
    refreshExpiresIn: '30d',
  },

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },

  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
  },

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
  },

  cors: {
    // Never fall back to '*' in production — an unset CORS_ORIGIN there
    // disables cross-origin instead of allowing everyone.
    origin:
      process.env.CORS_ORIGIN ||
      ((process.env.NODE_ENV || 'development') === 'production' ? false : '*'),
  },
} as const;
