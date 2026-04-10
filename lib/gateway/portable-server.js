
/**
 * OpenClaw Gateway - Mode Portable
 * Serveur léger sans service Windows
 */

import express from 'express';
import cors from 'cors';
import {  createServer  } from 'http';

const app = express();
const server = createServer(app);
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    mode: 'portable',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/api/status', (req, res) => {
  res.json({
    gateway: 'portable',
    version: '1.0.0',
    endpoints: ['/health', '/api/status', '/api/monitor']
  });
});

app.post('/api/fix', (req, res) => {
  const { issue } = req.body;
  console.log('🔧 Fix request:', issue);
  
  res.json({
    status: 'processing',
    issue: issue,
    timestamp: new Date().toISOString()
  });
});

// Démarrage serveur
server.listen(PORT, () => {
  console.log('🚀 OpenClaw Gateway Portable');
  console.log('🌐 Port:', PORT);
  console.log('📊 Health: http://localhost:' + PORT + '/health');
  console.log('🔧 Mode: Portable (no Windows service)');
});

// Arrêt propre
process.on('SIGINT', () => {
  console.log('\n🛑 Arrêt gateway portable...');
  server.close(() => {
    console.log('✅ Gateway arrêté');
    process.exit(0);
  });
});
