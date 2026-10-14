import test from 'node:test';
import assert from 'node:assert/strict';
import { blockedWorkers } from '../office3d/blocked-work.mjs';

test('a retained plan projects to the existing conversation with an exact review link', () => {
  const items = [{ id: 'plan:t2', kind: 'plan', appName: 'Shop', conversationId: 't1', title: 'Checkout', href: '#/app/shop/build/t1' }];
  assert.deepEqual(blockedWorkers(items, 'https://hq.example.test/'), [{ key: 'task:t1', appName: 'Shop', status: 'waiting',
    doing: 'Review plan: Checkout', link: 'https://hq.example.test/#/app/shop/build/t1' }]);
  assert.deepEqual(blockedWorkers([], 'https://hq.example.test'), []);
});
test('older feeds remain supported and arbitrary task links are rejected', () => {
  assert.deepEqual(blockedWorkers(undefined, null), []);
  assert.equal(blockedWorkers([{ kind: 'failed', conversationId: 't1', href: 'javascript:alert(1)' }], 'https://hq.example.test')[0].link, null);
});
