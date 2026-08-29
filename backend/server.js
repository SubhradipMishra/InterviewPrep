require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config/db');

const app = express();

// Middleware
app.use(cors({
  origin: true, // Reflects the incoming origin, which is required when using credentials or strict browsers
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Grok-API-Key', 'Accept', 'Origin']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Define Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/interviews', require('./routes/interviews'));

// Health Check Route
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    database: 'mongodb'
  });
});

// Root Route
app.get('/', (req, res) => {
  res.send('AI-Powered Interview Prep API is running...');
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err.stack);
  res.status(500).json({ message: 'Internal Server Error' });
});

connectDB();

if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server started on port ${PORT}`);
    console.log(`📡 Health endpoint: http://localhost:${PORT}/api/health`);
  });
}

module.exports = app;
