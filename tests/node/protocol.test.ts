import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMessage } from '../../workers/content-runtime/src/protocol.ts';

test('worker envelope rejects non-string node version', () => {
  assert.throws(() => parseMessage(JSON.stringify({ requestId: 'r', nodeId: 'n', nodeVersion: 1, type: 'request', payload: {} })), /missing nodeVersion/);
});
