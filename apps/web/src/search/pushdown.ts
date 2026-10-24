import {
  andAll,
  conjuncts,
  isPlainTerm,
  negate,
  orAll,
  type ParserAst,
  type TagToken,
  tagKey,
  tagText,
} from "./ast";

export interface PushedNode<N> {
  native: N;
  exact: boolean;
}

export interface Dialect<N> {
  leaf(tag: TagToken): PushedNode<N> | null;
  and(parts: N[]): N | null;
  or(parts: N[]): N | null;
  not(part: N): N | null;
}

export function compileWith<N>(dialect: Dialect<N>): (node: ParserAst) => PushedNode<N> | null {
  const compile = (node: ParserAst): PushedNode<N> | null => {
    switch (node.type) {
      case "Tag":
        return dialect.leaf(node);
      case "ParenthesizedExpression":
        return compile(node.expression);
      case "UnaryOperator": {
        const inner = compile(node.operand);
        if (!inner?.exact) return null;
        const native = dialect.not(inner.native);
        return native === null ? null : { native, exact: true };
      }
      case "LogicalExpression": {
        const left = compile(node.left);
        const right = compile(node.right);
        if (node.operator.operator === "AND") {
          if (left && right) {
            const native = dialect.and([left.native, right.native]);
            if (native !== null) {
              return { native, exact: left.exact && right.exact };
            }
            return { native: left.native, exact: false };
          }
          const one = left ?? right;
          return one ? { native: one.native, exact: false } : null;
        }
        if (!left || !right) return null;
        const native = dialect.or([left.native, right.native]);
        return native === null ? null : { native, exact: left.exact && right.exact };
      }
      default:
        return null;
    }
  };
  return compile;
}

export interface PushdownPlan<N> {
  native: N[];
  residual: ParserAst | null;
}

export function planPushdown<N>(
  ast: ParserAst | boolean,
  compile: (node: ParserAst) => PushedNode<N> | null,
): PushdownPlan<N> {
  if (typeof ast === "boolean") return { native: [], residual: null };
  const native: N[] = [];
  const residual: ParserAst[] = [];
  for (const node of conjuncts(ast)) {
    const pushed = compile(node);
    if (!pushed) {
      residual.push(node);
      continue;
    }
    native.push(pushed.native);
    if (!pushed.exact) residual.push(node);
  }
  return { native, residual: andAll(residual) };
}

export interface TextPick {
  text: string | null;
  residual: ParserAst | null;
}

export function pickText(
  ast: ParserAst | boolean,
  isText: (tag: TagToken) => { exact: boolean } | null,
): TextPick {
  if (typeof ast === "boolean") return { text: null, residual: null };
  const parts = conjuncts(ast);
  for (const [index, node] of parts.entries()) {
    if (node.type !== "Tag" || !isPlainTerm(node)) continue;
    const verdict = isText(node);
    if (!verdict) continue;
    const rest = verdict.exact ? parts.filter((_, i) => i !== index) : parts;
    return { text: tagText(node), residual: andAll(rest) };
  }
  return { text: null, residual: andAll(parts) };
}

export function freeText(tag: TagToken): { exact: boolean } | null {
  return tagKey(tag) === null ? { exact: true } : null;
}

type Bound = ParserAst | boolean;

export function bindTags(
  ast: ParserAst | boolean,
  decide: (tag: TagToken) => boolean | null,
): Bound {
  if (typeof ast === "boolean") return ast;
  const bind = (node: ParserAst): Bound => {
    switch (node.type) {
      case "Tag": {
        const verdict = decide(node);
        return verdict === null ? node : verdict;
      }
      case "ParenthesizedExpression":
        return bind(node.expression);
      case "UnaryOperator": {
        const inner = bind(node.operand);
        return typeof inner === "boolean" ? !inner : negate(inner);
      }
      case "LogicalExpression": {
        const left = bind(node.left);
        const right = bind(node.right);
        if (node.operator.operator === "AND") {
          if (left === false || right === false) return false;
          if (left === true) return right;
          if (right === true) return left;
          return andAll([left, right]) ?? true;
        }
        if (left === true || right === true) return true;
        if (left === false) return right;
        if (right === false) return left;
        return orAll([left, right]) ?? false;
      }
      default:
        return true;
    }
  };
  return bind(ast);
}

export function topLevelValues(ast: ParserAst | boolean, key: string): string[] {
  if (typeof ast === "boolean") return [];
  return conjuncts(ast).flatMap((node) =>
    node.type === "Tag" && tagKey(node) === key && isPlainTerm(node) ? [tagText(node) ?? ""] : [],
  );
}

export function withoutTopLevel(ast: ParserAst | boolean, key: string): Bound {
  if (typeof ast === "boolean") return ast;
  const rest = conjuncts(ast).filter(
    (node) => !(node.type === "Tag" && tagKey(node) === key && isPlainTerm(node)),
  );
  return andAll(rest) ?? true;
}
