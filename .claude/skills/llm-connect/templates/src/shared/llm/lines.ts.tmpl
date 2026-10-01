/**
 * Splits a byte stream into text lines (without the line break), decoding UTF-8 safely across
 * chunks. When `signal` aborts, the pending read is cancelled and the abort reason is thrown,
 * so a stalled stream can always be stopped, even if the stream's source ignores the signal.
 */
export async function* readLines(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const cancel = () => {
    reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener('abort', cancel, { once: true });
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    signal?.throwIfAborted();
    for (;;) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        yield buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
      }
    }
    buffer += decoder.decode();
    if (buffer !== '') yield buffer.replace(/\r$/, '');
  } finally {
    signal?.removeEventListener('abort', cancel);
    // Stops the upstream body if the consumer exits early (e.g. after an error event).
    cancel();
  }
}
