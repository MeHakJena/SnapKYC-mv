// Builds the Express app. Kept separate from index.js so tests can use it without opening a port.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { login, USERS } from './auth.js';
import { checkKycToken } from './kycToken.js';
import { mockSnapkycResponse, isValidDummyId } from './mockSnapkyc.js';
import { getIceServers } from './ice.js';
import { readLocalFile, storageMode } from './storage.js';
import { customerRouter } from './routes/customer.js';
import { agentRouter } from './routes/agent.js';
import { reviewerRouter } from './routes/reviewer.js';

const CLIENT_DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'dist');

export function createApp() {
  const app = express(); // Express 5: errors thrown in async routes reach the error handler below
  app.set('trust proxy', 1); // Render/Vercel terminate HTTPS in front of us
  app.use(cors({ origin: config.clientOrigins.length ? config.clientOrigins : true }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, storage: storageMode }));

  // Staff login (hard-coded demo users).
  app.post('/api/auth/login', (req, res) => {
    const result = login(req.body?.username, req.body?.password);
    if (!result) return res.status(401).json({ error: 'Wrong username or password' });
    res.json(result);
  });
  app.get('/api/auth/demo-users', (_req, res) => res.json(USERS));

  // The mock SnapKYC service, exposed as its own endpoint so it can be called and inspected directly.
  app.post('/api/mock-snapkyc/verify', (req, res) => {
    if (!isValidDummyId(req.body?.idNumber)) return res.status(400).json({ error: 'Enter a 12-digit dummy ID number' });
    res.json(mockSnapkycResponse(req.body.idNumber));
  });

  // Public: is this KYC token genuine and unexpired?
  app.post('/api/verify', (req, res) => res.json(checkKycToken(req.body?.token)));

  // WebRTC relay settings (needed by both customer and agent).
  app.get('/api/ice-servers', async (req, res) => res.json(await getIceServers(Boolean(req.query.debug))));

  // Local-storage mode only: serve a file through a short-lived signed link.
  app.get('/api/media', async (req, res) => {
    try {
      const { filePath } = await readLocalFile(req.query.t);
      res.sendFile(filePath);
    } catch {
      res.status(403).json({ error: 'Link expired or invalid' });
    }
  });

  app.use('/api/customer', customerRouter);
  app.use('/api/agent', agentRouter);
  app.use('/api/reviewer', reviewerRouter);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // If the frontend has been built, serve it from the same server (single-URL deploy).
  if (fs.existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));
    app.get(/^(?!\/api|\/socket\.io).*/, (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server' });
  });

  return app;
}
