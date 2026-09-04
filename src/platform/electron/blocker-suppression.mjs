export function createBlockerSuppression(command) {
  let active = false;
  return {
    async setActive(nextActive) {
      const next = Boolean(nextActive);
      if (next === active) return;
      active = next;
      try {
        await command('companion:suppress', { source: 'blocker', active: next });
      } catch (error) {
        active = !next;
        throw error;
      }
    }
  };
}
