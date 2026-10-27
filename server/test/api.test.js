// One full run through the HTTP API (no browser): consent -> SnapKYC -> call ->
// recommendation -> maker-checker block -> approval -> token check.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { initDb } from '../src/db.js';
import { createApp } from '../src/app.js';

let app;
before(async () => {
  await initDb(); // in-memory database
  app = createApp();
});

async function loginAs(username) {
  const res = await request(app).post('/api/auth/login').send({ username, password: 'demo123' });
  assert.equal(res.status, 200);
  return `Bearer ${res.body.token}`;
}

async function sessionReadyForReview(agentName) {
  const create = await request(app)
    .post('/api/customer/sessions')
    .send({ consent: true, location: { lat: 12.97, lng: 77.59, accuracy: 20 } });
  assert.equal(create.status, 201);
  const { sessionId, secret } = create.body;

  const kyc = await request(app)
    .post(`/api/customer/sessions/${sessionId}/snapkyc`)
    .set('x-session-secret', secret)
    .send({ idNumber: '9999 0000 1234' });
  assert.equal(kyc.status, 200);
  assert.ok(kyc.body.name);

  const agent = await loginAs(agentName);
  assert.equal((await request(app).post(`/api/agent/sessions/${sessionId}/claim`).set('Authorization', agent)).status, 200);

  // Recommending before snapshot/recording are saved is refused.
  const early = await request(app).post(`/api/agent/sessions/${sessionId}/recommend`).set('Authorization', agent).send({ decision: 'approve' });
  assert.equal(early.status, 409);

  await request(app).post(`/api/agent/sessions/${sessionId}/snapshot`).set('Authorization', agent)
    .attach('file', Buffer.from('fake-jpeg'), { filename: 's.jpg', contentType: 'image/jpeg' }).expect(200);
  await request(app).post(`/api/agent/sessions/${sessionId}/recording`).set('Authorization', agent)
    .attach('file', Buffer.from('fake-webm'), { filename: 'r.webm', contentType: 'video/webm' }).expect(200);
  await request(app).post(`/api/agent/sessions/${sessionId}/recommend`).set('Authorization', agent)
    .send({ decision: 'approve', note: 'Looks fine' }).expect(200);

  return { sessionId, secret, agent };
}

test('consent and location are required', async () => {
  assert.equal((await request(app).post('/api/customer/sessions').send({ consent: false, location: { lat: 12, lng: 77 } })).status, 400);
  assert.equal((await request(app).post('/api/customer/sessions').send({ consent: true })).status, 400);
  assert.equal((await request(app).post('/api/customer/sessions').send({ consent: true, location: { lat: 51.5, lng: -0.1 } })).status, 403);
});

test('maker-checker is enforced by the server, and approval issues a valid token', async () => {
  const { sessionId, secret, agent } = await sessionReadyForReview('supervisor1');

  // The plain agent cannot reach the reviewer API at all.
  const asAgent = await request(app).post(`/api/reviewer/sessions/${sessionId}/decision`)
    .set('Authorization', await loginAs('agent1')).send({ decision: 'approve' });
  assert.equal(asAgent.status, 403);

  // supervisor1 has the reviewer role but ran this call: blocked.
  const own = await request(app).post(`/api/reviewer/sessions/${sessionId}/decision`).set('Authorization', agent).send({ decision: 'approve' });
  assert.equal(own.status, 403);
  assert.match(own.body.error, /Maker-checker/);

  // A different reviewer approves.
  const ok = await request(app).post(`/api/reviewer/sessions/${sessionId}/decision`)
    .set('Authorization', await loginAs('reviewer1')).send({ decision: 'approve' });
  assert.equal(ok.status, 200);

  const status = await request(app).get(`/api/customer/sessions/${sessionId}`).set('x-session-secret', secret);
  assert.equal(status.body.status, 'approved');
  assert.ok(status.body.token);

  const check = await request(app).post('/api/verify').send({ token: status.body.token });
  assert.equal(check.body.valid, true);
  assert.equal(check.body.claims.kyc_status, 'verified');

  const tampered = status.body.token.slice(0, -3) + 'abc';
  assert.equal((await request(app).post('/api/verify').send({ token: tampered })).body.valid, false);

  // Audit trail has every step.
  const detail = await request(app).get(`/api/reviewer/sessions/${sessionId}`).set('Authorization', await loginAs('reviewer1'));
  const actions = detail.body.events.map((e) => e.action);
  for (const a of ['consent_given', 'location_captured', 'snapkyc_verified', 'call_claimed', 'snapshot_taken',
    'recording_saved', 'recommend_approve', 'decision_blocked', 'approved', 'token_issued']) {
    assert.ok(actions.includes(a), `missing event ${a}`);
  }
});

test('rejection needs a reason and the customer sees it, with no token', async () => {
  const { sessionId, secret } = await sessionReadyForReview('agent2');
  const reviewer = await loginAs('reviewer1');
  assert.equal((await request(app).post(`/api/reviewer/sessions/${sessionId}/decision`).set('Authorization', reviewer).send({ decision: 'reject' })).status, 400);
  await request(app).post(`/api/reviewer/sessions/${sessionId}/decision`).set('Authorization', reviewer)
    .send({ decision: 'reject', reason: 'Face not clearly visible' }).expect(200);
  const status = await request(app).get(`/api/customer/sessions/${sessionId}`).set('x-session-secret', secret);
  assert.equal(status.body.status, 'rejected');
  assert.equal(status.body.rejectionReason, 'Face not clearly visible');
  assert.equal(status.body.token, null);
});

test('another customer cannot read a session without its secret', async () => {
  const create = await request(app).post('/api/customer/sessions').send({ consent: true, location: { lat: 12.97, lng: 77.59 } });
  const res = await request(app).get(`/api/customer/sessions/${create.body.sessionId}`).set('x-session-secret', 'wrong');
  assert.equal(res.status, 404);
});
