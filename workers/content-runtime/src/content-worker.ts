import { emit, parseMessage, type WorkerMessage } from './protocol.ts';

const nodeId = 'content-runtime';
const nodeVersion = '0.1.0';
process.stdin.setEncoding('utf8');
let buffer = '';
process.stdin.on('data', (chunk: string) => {
  buffer += chunk;
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop() ?? '';
  for (const line of lines.filter(Boolean)) handle(line);
});

function handle(line: string): void {
  let request: WorkerMessage;
  try { request = parseMessage(line.replace(/^\uFEFF/, '')); } catch (error) {
    console.error(`[content-runtime] invalid input: ${String(error)}`);
    return;
  }
  if (request.type === 'cancel') {
    emit({ requestId: request.requestId, nodeId, nodeVersion, type: 'cancelled', payload: { checkpoint: 'received' } });
    return;
  }
  emit({ requestId: request.requestId, nodeId, nodeVersion, type: 'progress', payload: { value: 0.5, message: 'content runtime skeleton' } });
  emit({ requestId: request.requestId, nodeId, nodeVersion, type: 'result', payload: { accepted: true, input: request.payload } });
}
