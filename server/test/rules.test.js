import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canDecide, canRecommend, isInIndia, STATUS } from '../src/rules.js';

const agent = { id: 'agent1', roles: ['agent'] };
const reviewer = { id: 'reviewer1', roles: ['reviewer'] };
const both = { id: 'supervisor1', roles: ['agent', 'reviewer'] };

const recommended = (agentId) => ({ id: 's1', status: STATUS.RECOMMENDED, agent_id: agentId });

test('a different reviewer can decide', () => {
  assert.equal(canDecide(reviewer, recommended('agent1')).ok, true);
});

test('maker-checker: the agent who ran the call cannot decide, even with the reviewer role', () => {
  const result = canDecide(both, recommended('supervisor1'));
  assert.equal(result.ok, false);
  assert.equal(result.code, 403);
  assert.match(result.reason, /Maker-checker/);
});

test('a user with both roles CAN review someone else\'s call', () => {
  assert.equal(canDecide(both, recommended('agent1')).ok, true);
});

test('an agent without the reviewer role cannot decide', () => {
  assert.equal(canDecide(agent, recommended('agent2')).ok, false);
});

test('cannot decide twice or before a recommendation', () => {
  assert.equal(canDecide(reviewer, { status: STATUS.APPROVED, agent_id: 'agent1' }).ok, false);
  assert.equal(canDecide(reviewer, { status: STATUS.IN_CALL, agent_id: 'agent1' }).ok, false);
});

test('agent must save snapshot and recording before recommending', () => {
  const s = { status: STATUS.IN_CALL, agent_id: 'agent1', snapshot_key: null, recording_key: null };
  assert.equal(canRecommend(agent, s).ok, false);
  assert.equal(canRecommend(agent, { ...s, snapshot_key: 'a', recording_key: 'b' }).ok, true);
  assert.equal(canRecommend({ id: 'agent2', roles: ['agent'] }, { ...s, snapshot_key: 'a', recording_key: 'b' }).ok, false);
});

test('India location check', () => {
  assert.equal(isInIndia(12.97, 77.59), true); // Bengaluru
  assert.equal(isInIndia(28.41, 77.31), true); // Faridabad
  assert.equal(isInIndia(51.5, -0.12), false); // London
});
