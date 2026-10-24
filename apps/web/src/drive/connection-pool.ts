const IDLE_MS = 5 * 60_000;

export interface PoolTarget<C> {
  server: string;
  login: string;
  size: number;
  connect(): Promise<C>;
}

export interface Lease<C> {
  connection: C;
  release: () => void;
  discard: () => void;
}

interface Slot<C> {
  login: string;
  connection: C;
  idleTimer: ReturnType<typeof setTimeout> | null;
  generation: number;
}

interface Waiter<C> {
  target: PoolTarget<C>;
  resolve(slot: Slot<C>): void;
  reject(err: unknown): void;
}

interface Pool<C> {
  idle: Slot<C>[];
  open: number;
  waiters: Waiter<C>[];
  generation: number;
}

export function createConnectionPools<C>(handlers: {
  close(connection: C): void;
  isClosed(connection: C): boolean;
}) {
  const pools = new Map<string, Pool<C>>();

  function poolFor(server: string): Pool<C> {
    let pool = pools.get(server);
    if (!pool) {
      pool = { idle: [], open: 0, waiters: [], generation: 0 };
      pools.set(server, pool);
    }
    return pool;
  }

  function closeSlot(pool: Pool<C>, slot: Slot<C>): void {
    if (slot.idleTimer) clearTimeout(slot.idleTimer);
    slot.idleTimer = null;
    pool.idle = pool.idle.filter((item) => item !== slot);
    handlers.close(slot.connection);
    pool.open -= 1;
  }

  function openFor(pool: Pool<C>, waiter: Waiter<C>): void {
    pool.open += 1;
    const generation = pool.generation;
    waiter.target.connect().then(
      (connection) =>
        waiter.resolve({
          login: waiter.target.login,
          connection,
          idleTimer: null,
          generation,
        }),
      (err) => {
        pool.open -= 1;
        waiter.reject(err);
        serveWaiters(pool);
      },
    );
  }

  function serveWaiters(pool: Pool<C>): void {
    while (pool.waiters.length > 0) {
      const waiter = pool.waiters[0];
      if (!waiter) return;

      const reusable = pool.idle.find((item) => item.login === waiter.target.login);
      if (reusable) {
        pool.waiters.shift();
        if (reusable.idleTimer) clearTimeout(reusable.idleTimer);
        reusable.idleTimer = null;
        pool.idle = pool.idle.filter((item) => item !== reusable);
        waiter.resolve(reusable);
        continue;
      }

      if (pool.open < waiter.target.size) {
        pool.waiters.shift();
        openFor(pool, waiter);
        continue;
      }

      const evictable = pool.idle[0];
      if (evictable) {
        closeSlot(pool, evictable);
        continue;
      }
      return;
    }
  }

  function park(pool: Pool<C>, slot: Slot<C>): void {
    slot.idleTimer = setTimeout(() => {
      closeSlot(pool, slot);
    }, IDLE_MS);
    slot.idleTimer.unref?.();
    pool.idle.push(slot);
    serveWaiters(pool);
  }

  function leaseOf(pool: Pool<C>, slot: Slot<C>): Lease<C> {
    let settled = false;
    return {
      connection: slot.connection,
      release() {
        if (settled) return;
        settled = true;
        if (handlers.isClosed(slot.connection)) {
          pool.open -= 1;
          serveWaiters(pool);
          return;
        }
        if (slot.generation !== pool.generation) {
          handlers.close(slot.connection);
          pool.open -= 1;
          serveWaiters(pool);
          return;
        }
        park(pool, slot);
      },
      discard() {
        if (settled) return;
        settled = true;
        handlers.close(slot.connection);
        pool.open -= 1;
        serveWaiters(pool);
      },
    };
  }

  async function acquire(target: PoolTarget<C>, signal?: AbortSignal): Promise<Lease<C>> {
    signal?.throwIfAborted();
    const pool = poolFor(target.server);

    const slot = await new Promise<Slot<C>>((resolve, reject) => {
      const waiter: Waiter<C> = { target, resolve, reject };
      pool.waiters.push(waiter);
      signal?.addEventListener(
        "abort",
        () => {
          const index = pool.waiters.indexOf(waiter);
          if (index === -1) return;
          pool.waiters.splice(index, 1);
          reject(signal.reason);
        },
        { once: true },
      );
      serveWaiters(pool);
    });

    if (handlers.isClosed(slot.connection)) {
      pool.open -= 1;
      serveWaiters(pool);
      return acquire(target, signal);
    }
    return leaseOf(pool, slot);
  }

  function retire(server: string): void {
    const pool = pools.get(server);
    if (!pool) return;
    pool.generation += 1;
    for (const slot of pool.idle) closeSlot(pool, slot);
    serveWaiters(pool);
  }

  function servers(): string[] {
    return [...pools.keys()];
  }

  return { acquire, retire, servers };
}
