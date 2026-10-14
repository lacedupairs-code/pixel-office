import test from 'node:test';
import assert from 'node:assert/strict';
import { conversationLink, conversationModel, newestConversations } from '../office3d/conversations.mjs';
import { blockedWorkers } from '../office3d/blocked-work.mjs';
test('a follow-up replaces its older status, with one stable worker per conversation', () => {
  const newest = { id: 't2', conversationId: 't1', status: 'running', agentName: 'Juniper' };
  const tasks = newestConversations([newest, { id: 't1', conversationId: 't1', status: 'done' }]);
  assert.equal(tasks.size, 1); assert.equal(tasks.get('t1'), newest);
  assert.equal(conversationModel('gpt-6.1'), 'Codex');
  assert.equal(conversationModel('sonnet'), 'Claude Code');
});
test('links identify the exact Canvas conversation and reject unsafe bases and IDs', () => {
  assert.equal(conversationLink('https://hq.example.test/', 'shop', 'abc123'), 'https://hq.example.test/#/app/shop/canvas/build/abc123');
  for (const base of ['javascript:alert(1)', 'https://user:secret@example.test', null]) assert.equal(conversationLink(base, 'shop', 'abc123'), null);
  assert.equal(conversationLink('https://hq.example.test', '../shop', 'abc123'), null);
});
test('renames follow the shared source without changing worker identity', () => {
  const item = { kind: 'plan', appId: 'shop', conversationId: 'abc123', agentName: 'Nova' };
  const before = blockedWorkers([item], 'https://hq.example.test')[0];
  const after = blockedWorkers([{ ...item, agentName: 'Juniper' }], 'https://hq.example.test')[0];
  assert.equal(before.key, after.key); assert.equal(after.name, 'Juniper');
});
