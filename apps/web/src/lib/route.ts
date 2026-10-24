import type { Route } from "next";

export function route(path: string): Route {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Next's typed routes validate literal hrefs only; a built path needs `as Route`, per the typedRoutes docs
  return path as Route;
}
