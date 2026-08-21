export class SystemClock {
  now() { return Date.now(); }
}

export class FakeClock {
  constructor(now = 0) { this.value = now; }
  now() { return this.value; }
  set(value) { this.value = value; }
  advance(ms) { this.value += ms; }
}

export const localDayKey = (timestamp) => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
