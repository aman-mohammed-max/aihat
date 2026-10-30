/** Stop native generation when a stream is abandoned, and ignore callbacks after its consumer closes. */
export function createGenerationLifecycle(stop) {
  let closed = false;

  return {
    get closed() {
      return closed;
    },
    push(value, accept) {
      if (closed) return false;
      accept(value);
      return true;
    },
    close(completed) {
      if (closed) return;
      closed = true;
      if (!completed) stop();
    },
  };
}
