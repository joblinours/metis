import type { ParserAst } from "./ast";

export type Residual = ParserAst | null;

export type Accept<T> = (residual: Residual, items: T[]) => Promise<T[]>;

export interface AstSearch<T> {
  query: ParserAst | boolean;
  accept: Accept<T>;
  timeZone: string;
  cursor?: string;
}

export const SEARCH_PAGE_SIZE = 25;
