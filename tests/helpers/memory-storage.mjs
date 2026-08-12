export class MemoryStorage {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(initial));
    this.failWrites = false;
  }

  get length() {
    return this.values.size;
  }

  key(index) {
    return [...this.values.keys()][index] ?? null;
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    if (this.failWrites) throw new Error("Quota exceeded");
    this.values.set(key, String(value));
  }

  removeItem(key) {
    if (this.failWrites) throw new Error("Storage unavailable");
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}
