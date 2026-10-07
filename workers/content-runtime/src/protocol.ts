export type WorkerType = 'request' | 'progress' | 'heartbeat' | 'result' | 'error' | 'cancel' | 'cancelled';
export type WorkerMessage = { requestId: string; nodeId: string; nodeVersion: string; type: WorkerType; payload: unknown };

export function parseMessage(line: string): WorkerMessage {
  const value = JSON.parse(line) as Partial<WorkerMessage>;
  for (const key of ['requestId', 'nodeId', 'nodeVersion', 'type']) {
    if (typeof value[key as keyof WorkerMessage] !== 'string' || !value[key as keyof WorkerMessage]) throw new Error(`missing ${key}`);
  }
  return value as WorkerMessage;
}

export function emit(message: WorkerMessage): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
