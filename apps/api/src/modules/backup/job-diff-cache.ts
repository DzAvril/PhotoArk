type CacheEntry<T> = {
  value: T;
  createdAtMs: number;
};

export class TimedValueCache<T> {
  private readonly values = new Map<string, CacheEntry<T>>();

  constructor(private readonly options: { ttlMs: number; maxEntries: number }) {}

  get(key: string, nowMs = Date.now()): T | undefined {
    const entry = this.values.get(key);
    if (!entry) return undefined;
    if (nowMs - entry.createdAtMs > this.options.ttlMs) {
      this.values.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, nowMs = Date.now()): void {
    this.values.set(key, { value, createdAtMs: nowMs });
    this.prune();
  }

  delete(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }

  private prune(): void {
    while (this.values.size > Math.max(1, this.options.maxEntries)) {
      const firstKey = this.values.keys().next().value;
      if (!firstKey) return;
      this.values.delete(firstKey);
    }
  }
}
