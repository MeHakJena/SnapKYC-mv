// Entry point: database, HTTP API, and video-call signaling on one port.
import http from 'node:http';
import { config } from './config.js';
import { initDb } from './db.js';
import { createApp } from './app.js';
import { attachSignaling } from './signaling.js';
import { storageMode } from './storage.js';

await initDb();
const server = http.createServer(createApp());
attachSignaling(server);

server.listen(config.port, () => {
  console.log(`SnapKYC Video server on http://localhost:${config.port} (storage: ${storageMode})`);
});
