require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

// Connect DB
connectDB();

const app = express();

const rateLimit = require('express-rate-limit');

// General API limiter — 500 requests per 15 min per IP (generous for single-vendor use)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again in a few minutes.' },
  skip: (req) => req.path === '/api/health', // never limit health checks
});

// Strict limiter only for auth routes (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts, please try again later.' },
});

// CORS Configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];


app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

// Middleware
app.use(express.json({ limit: '10mb' }));  // 10mb for base64 logo uploads
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(generalLimiter);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/deliveries', require('./routes/deliveries'));
app.use('/api/bills', require('./routes/bills'));
app.use('/api/vendor', require('./routes/vendor'));
app.use('/api/admin', require('./routes/admin'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: '🚰 PaniHisab API is running!', timestamp: new Date() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found.` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'development' ? err.message : 'Internal server error';
  res.status(status).json({ success: false, message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 PaniHisab Backend running on http://localhost:${PORT}`);
});
