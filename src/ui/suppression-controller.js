export function createSuppressionController({ send, retryDelayMs = 250, maxRetries = 3 } = {}) {
  const sources = new Map();
  let disposed = false;

  const getSource = (source) => {
    if (!sources.has(source)) sources.set(source, { desired: false, confirmed: false, inFlight: false, retries: 0, timer: null, promise: null });
    return sources.get(source);
  };

  const reconcile = (source) => {
    const state = getSource(source);
    if (disposed || state.inFlight || state.confirmed === state.desired) return state.promise || Promise.resolve();
    const target = state.desired;
    state.inFlight = true;
    state.promise = Promise.resolve()
      .then(() => send(source, target))
      .then(() => {
        state.confirmed = target;
        state.retries = 0;
      })
      .catch(() => {
        if (state.desired !== state.confirmed && state.retries < maxRetries) {
          state.retries += 1;
          state.timer = setTimeout(() => { state.timer = null; reconcile(source); }, retryDelayMs);
        } else state.retries = maxRetries + 1;
      })
      .finally(() => {
        state.inFlight = false;
        state.promise = null;
        if (!state.timer && state.desired !== state.confirmed && state.retries <= maxRetries) reconcile(source);
      });
    return state.promise;
  };

  return {
    setDesired(source, active) {
      const state = getSource(source);
      state.desired = Boolean(active);
      state.retries = 0;
      if (state.timer) { clearTimeout(state.timer); state.timer = null; }
      return reconcile(source);
    },
    snapshot(source) {
      const state = getSource(source);
      return { desired: state.desired, confirmed: state.confirmed, inFlight: state.inFlight, retries: state.retries };
    },
    dispose() {
      disposed = true;
      for (const state of sources.values()) if (state.timer) clearTimeout(state.timer);
      sources.clear();
    }
  };
}
