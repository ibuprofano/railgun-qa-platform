import { describe, expect, it, vi } from 'vitest';
import { readEventStream, type StreamEvent } from './live-updates';

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
}

async function read(chunks: string[]): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  await readEventStream(streamOf(chunks), (event) => events.push(event));
  return events;
}

describe('readEventStream', () => {
  it('dispatches named events with their data', async () => {
    expect(await read(['event: ready\ndata: {}\n\nevent: execution.changed\ndata: {"executionId":"e1"}\n\n'])).toEqual([
      { event: 'ready', data: '{}' },
      { event: 'execution.changed', data: '{"executionId":"e1"}' },
    ]);
  });

  it('joins events split across chunks, even mid-line', async () => {
    expect(await read(['eve', 'nt: execution.cha', 'nged\ndata: {"execu', 'tionId":"e1"}\n', '\n'])).toEqual([
      { event: 'execution.changed', data: '{"executionId":"e1"}' },
    ]);
  });

  it('joins multi-line data with newlines and defaults the event name to "message"', async () => {
    expect(await read(['data: first\ndata: second\n\n'])).toEqual([{ event: 'message', data: 'first\nsecond' }]);
  });

  it('ignores comments (heartbeats) and retry hints, but reports them as activity', async () => {
    const onActivity = vi.fn();
    const events: StreamEvent[] = [];
    await readEventStream(streamOf(['retry: 3000\n\n', ': ping\n\n', ': ping\n\n']), (e) => events.push(e), onActivity);

    expect(events).toEqual([]);
    expect(onActivity).toHaveBeenCalledTimes(3);
  });

  it('accepts CRLF and CR line endings, including a CRLF split across chunks', async () => {
    expect(await read(['event: ready\r\ndata: {}\r', '\n\r\nevent: resync\rdata: {}\r\r'])).toEqual([
      { event: 'ready', data: '{}' },
      { event: 'resync', data: '{}' },
    ]);
  });

  it('drops an event the stream ended before finishing', async () => {
    expect(await read(['event: ready\ndata: {}\n\nevent: execution.changed\ndata: {"executionId":"e1"}\n'])).toEqual([
      { event: 'ready', data: '{}' },
    ]);
  });
});
