/**
 * Vercel Serverless Function Adapter for Express App
 * Routes all /api/* requests to the Express application routes.
 */
const { app } = require('../server');

module.exports = (req, res) => {
  return app(req, res);
};
