const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Each IP can send at most 100 requests within windowMs
  standardHeaders: true, // Return standard rate limit headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  message: 'Too many requests, please try again later'
});

module.exports = limiter; 