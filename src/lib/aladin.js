let pending;

export function loadAladin() {
  if (!pending) {
    // Vite serves this pinned npm dependency locally, including its embedded WASM.
    pending = (async () => {
      let timer;
      try {
        return await Promise.race([
          (async () => {
            const { default: A } = await import('aladin-lite');
            await A.init;
            return A;
          })(),
          new Promise((_, reject) => {
            timer = setTimeout(
              () =>
                reject(new Error('Local sky engine initialization timed out. Reload to retry.')),
              25000
            );
          }),
        ]);
      } catch (cause) {
        pending = undefined;
        throw new Error(
          'Could not start the local sky engine. Check that WebGL2 is enabled and reload to retry.',
          { cause }
        );
      } finally {
        clearTimeout(timer);
      }
    })();
  }
  return pending;
}
