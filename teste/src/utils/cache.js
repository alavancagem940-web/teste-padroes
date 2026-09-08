const store = new Map();
const inflight = new Map();

export async function cached(key, ttlMs, fn) {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) return hit.value;

  // Se duas partes do app pedirem o mesmo recurso ao mesmo tempo, compartilha a
  // mesma chamada externa em vez de gastar a cota duas vezes.
  if (inflight.has(key)) return inflight.get(key);

  const task = (async () => {
    try {
      const value = await fn();
      const staleWindow = Math.max(Number(ttlMs || 0) * 4, 30 * 60 * 1000);
      store.set(key, {
        value,
        expiresAt: Date.now() + Number(ttlMs || 0),
        staleUntil: Date.now() + staleWindow
      });
      return value;
    } catch (error) {
      // Se a API externa estiver momentaneamente limitada, é melhor reaproveitar
      // o último dado válido por um curto período do que derrubar a tela inteira.
      if (hit && hit.staleUntil > now) return hit.value;
      throw error;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}
