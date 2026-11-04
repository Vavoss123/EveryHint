// Observe an owned renderer without relying on Playwright's page discovery.
// Electron can expose a live assistant target before Playwright lists its page.
export async function rendererCdp(port, matches) {
  const deadline = Date.now() + 15000;
  let target;
  while (!target && Date.now() < deadline) {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
      signal: AbortSignal.timeout(5000),
    });
    target = (await response.json()).find((candidate) => matches(candidate.url));
    if (!target) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!target) throw Error("The owned renderer target did not appear.");
  const endpoint = new URL(target.webSocketDebuggerUrl);
  if (
    endpoint.protocol !== "ws:" ||
    endpoint.hostname !== "127.0.0.1" ||
    endpoint.port !== String(port)
  )
    throw Error("Renderer inspection must stay on the owned loopback port.");
  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close();
      reject(Error("Renderer inspection connection timed out."));
    }, 5000);
    socket.addEventListener("open", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(Error("Renderer inspection connection failed."));
    }, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error || message.result?.exceptionDetails)
      request.reject(Error("Renderer inspection evaluation failed."));
    else request.resolve(message.result.result.value);
  });
  socket.addEventListener("close", () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(Error("Renderer inspection connection closed."));
    }
    pending.clear();
  });
  return {
    evaluate(expression) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(Error("Renderer inspection evaluation timed out."));
        }, 5000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({
          id,
          method: "Runtime.evaluate",
          params: { expression, returnByValue: true, awaitPromise: true },
        }));
      });
    },
    close() { socket.close(); },
  };
}
