import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';
import routes from './routes/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Winston logger
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: path.join(__dirname, '../logs/error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(__dirname, '../logs/combined.log') }),
  ],
});

if (process.env.NODE_ENV !== 'production' || !process.env.DISABLE_CONSOLE_LOG) {
  logger.add(new winston.transports.Console({ format: winston.format.simple() }));
}

const app = express();
const PORT = process.env.PORT || 3001;

// Security headers (thoải mái hơn cho production)
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

// Parse JSON body
app.use(express.json({ limit: '10mb' }));

// General rate limit (5000 req/15 ph = ~5.5 req/s, đủ cho 250+ HS)
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  message: { success: false, message: 'Quá nhiều yêu cầu, vui lòng thử lại sau', code: 'RATE_LIMIT' },
}));

// Login rate limit (60 req/min/IP)
app.use('/api/login', rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { success: false, message: 'Quá nhiều lần đăng nhập, vui lòng thử lại sau 1 phút', code: 'LOGIN_RATE_LIMIT' },
}));

// Attach logger to req
app.use((req, res, next) => {
  req.logger = logger;
  next();
});

// Routes
app.use(routes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Production: serve frontend build ---
const frontendDist = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy đường dẫn', code: 'NOT_FOUND' });
  }
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error({ message: err.message, stack: err.stack, url: req.originalUrl, method: req.method });

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Dữ liệu không hợp lệ',
      code: 'VALIDATION_ERROR',
      errors: err.errors || [],
    });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ success: false, message: 'Token không hợp lệ', code: 'UNAUTHORIZED' });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Đã xảy ra lỗi server',
    code: err.code || 'INTERNAL_ERROR',
  });
});

// Keep-alive: tự ping mỗi 5 ph để Render Free không ngủ
if (process.env.NODE_ENV === 'production') {
  const host = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  const agent = host.startsWith('https') ? https : http;
  const ping = () => {
    const req = agent.get(`${host}/health`, (res) => {
      logger.info(`Keep-alive ping: ${res.statusCode}`);
      res.resume();
    });
    req.on('error', (err) => logger.warn(`Keep-alive failed: ${err.message}`));
    req.setTimeout(10000, () => { req.destroy(); logger.warn('Keep-alive timeout'); });
  };
  setInterval(ping, 5 * 60 * 1000);
  ping();
}

// Cấu hình Supabase project ID để cron-job.org ping giữ project không bị pause
const SUPABASE_PROJECT_ID = process.env.SUPABASE_URL?.match(/https:\/\/(.+)\.supabase\.co/)?.[1];
if (SUPABASE_PROJECT_ID) {
  logger.info(`Supabase project ID: ${SUPABASE_PROJECT_ID} — dùng cron-job.org ping /rest/v1/ để giữ active`);
}

app.listen(PORT, () => {
  logger.info(`Server đang chạy tại port ${PORT}`);
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
