export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = Array.from({ length: items.length });
  const queue = items.entries();
  const worker = async () => {
    for (const [index, item] of queue) {
      try {
        // oxlint-disable-next-line eslint/no-await-in-loop -- each worker takes the next item only after its current one settles; the worker count is the limit
        results[index] = { status: "fulfilled", value: await fn(item, index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}
