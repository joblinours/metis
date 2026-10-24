export type Ops<A, H> = {
  [K in keyof A]: A[K] extends (...args: infer P) => infer R ? (handle: H, ...args: P) => R : never;
};

export function bind<A extends object, H>(ops: Ops<A, H>, handle: H): A {
  const bound: Record<string, unknown> = {};
  /* oxlint-disable typescript/no-unsafe-type-assertion -- Ops<A, H> maps every member of A to a handle-first function; TypeScript cannot carry a mapped type back through Object.entries */
  for (const [key, fn] of Object.entries(ops)) {
    bound[key] = (...args: unknown[]) =>
      (fn as (h: H, ...a: unknown[]) => unknown)(handle, ...args);
  }
  return bound as A;
  /* oxlint-enable typescript/no-unsafe-type-assertion */
}
