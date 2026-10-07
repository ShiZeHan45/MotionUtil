import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMessage } from '../src/protocol.ts';

test('JSONL protocol requires envelope fields', () => {
  const message = parseMessage(JSON.stringify({ requestId: 'r', nodeId: 'n', nodeVersion: '1', type: 'request', payload: {} }));
  assert.equal(message.type, 'request');
  assert.throws(() => parseMessage('{}'), /missing requestId/);
});
