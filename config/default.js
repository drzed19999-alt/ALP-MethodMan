const path = require('path');
require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  host: process.env.HOST || '0.0.0.0',
  
  jwt: {
    secret: process.env.JWT_SECRET || 'alp-super-secret-key-change-in-production-2024',
    expiresIn: '24h'
  },

  db: {
    path: process.env.DB_PATH || path.join(__dirname, '..', 'database', 'alp.db')
  },

  session: {
    timeoutMs: 30 * 60 * 1000,  // 30 minutes inactivity = session end
    cleanupIntervalMs: 5 * 60 * 1000  // Cleanup every 5 minutes
  },

  rateLimit: {
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 100  // limit each IP to 100 requests per windowMs
  },

  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
  },

  defaultAdmin: {
    username: 'admin',
    email: 'admin@alp.local',
    password: 'admin123',
    role: 'super_admin'
  },

  telegram: {
    pollingInterval: 1000
  }
};
