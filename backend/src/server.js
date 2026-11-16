require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const db = require('./db');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const taskRoutes = require('./routes/task.routes');
const routineRoutes = require('./routes/routine.routes');

const app = express();
  
const corsOptions = {
  origin: process.env.CORS_ORIGIN,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/routines', routineRoutes);

// Fallback error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, async () => {
  console.log(`Studio Tasks API listening on port ${PORT}`);
  try {
    const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
    await db.query(schema);
  } catch (err) {
    console.error('Schema sync warning:', err.message);
  }
});
