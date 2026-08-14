require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const taskRoutes = require('./routes/task.routes');

const app = express();

/* =========================
   CORS CONFIGURATION
========================= */

const allowedOrigins = [
  process.env.CORS_ORIGIN,
  'http://localhost:4000',
  'http://localhost:3000'
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests without an Origin header
    // (Postman, server-to-server, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // Allow your exact frontend URL
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Allow Vercel preview/production frontend URLs
    if (
      /^https:\/\/[a-zA-Z0-9-]+\.vercel\.app$/.test(origin)
    ) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked: ${origin}`));
  },

  credentials: true,

  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization'
  ],

  optionsSuccessStatus: 204
};

// CORS middleware
app.use(cors(corsOptions));

// Explicitly handle ALL preflight requests
app.options(/.*/, cors(corsOptions));

/* =========================
   BODY PARSER
========================= */

app.use(express.json());

/* =========================
   HEALTH CHECK
========================= */

app.get('/api/health', (req, res) => {
  res.status(200).json({
    ok: true,
    message: 'Studio Tasks API is running'
  });
});

/* =========================
   API ROUTES
========================= */

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tasks', taskRoutes);

/* =========================
   ERROR HANDLER
========================= */

app.use((err, req, res, next) => {
  console.error('SERVER ERROR:', err);

  if (err.message && err.message.startsWith('CORS blocked:')) {
    return res.status(403).json({
      error: 'CORS blocked',
      origin: req.headers.origin
    });
  }

  res.status(500).json({
    error: 'Something went wrong on the server.'
  });
});

/* =========================
   404 HANDLER
========================= */

app.use((req, res) => {
  res.status(404).json({
    error: 'Not found.',
    path: req.originalUrl
  });
});

/* =========================
   LOCAL DEVELOPMENT
========================= */

const PORT = process.env.PORT || 4000;

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Studio Tasks API listening on port ${PORT}`);
  });
}

/* =========================
   VERCEL
========================= */

module.exports = app;