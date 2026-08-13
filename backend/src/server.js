require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const taskRoutes = require('./routes/task.routes');

const app = express();

// --- UPDATED CORS CONFIGURATION ---
const productionOrigin = process.env.CORS_ORIGIN;

app.use(cors({
  origin: function (origin, callback) {
    // 1. Allow requests with no origin (e.g., mobile apps, curl)
    if (!origin) return callback(null, true);

    // 2. Allow if it exactly matches your production environment variable
    if (origin === productionOrigin) {
      return callback(null, true);
    }

    // 3. Dynamically allow all Vercel preview URLs (this fixes your current error)
    if (origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }

    // 4. Allow localhost for local development
    if (origin.startsWith('http://localhost:')) {
      return callback(null, true);
    }

    // If none of the above match, reject the request
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true // Optional: Add this if your app uses cookies or authorization headers
}));
// ----------------------------------

app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tasks', taskRoutes);

// Fallback error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});ś

app.use((req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Studio Tasks API listening on port ${PORT}`);
});