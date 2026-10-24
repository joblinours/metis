import type { ComparisonOperatorToken, ExpressionToken, ParserAst, TagToken } from "liqe";

export type { ParserAst, TagToken };

export type Comparison = ComparisonOperatorToken["operator"];

export function tagKey(tag: TagToken): string | null {
  return tag.field.type === "Field" ? tag.field.name.toLowerCase() : null;
}

export function tagText(tag: TagToken): string | null {
  const { expression } = tag;
  if (expression.type !== "LiteralExpression") return null;
  if (expression.value === null) return null;
  return String(expression.value);
}

export function tagQuoted(tag: TagToken): boolean {
  return tag.expression.type === "LiteralExpression" && tag.expression.quoted;
}

export function tagOperator(tag: TagToken): Comparison {
  const token: TagToken["operator"] | undefined = tag.operator;
  return token?.operator ?? ":";
}

export function isWildcard(tag: TagToken): boolean {
  const text = tagText(tag);
  return !tagQuoted(tag) && text !== null && /[*?]/.test(text);
}

export function isPlainTerm(tag: TagToken): boolean {
  return (
    tag.expression.type === "LiteralExpression" &&
    tagOperator(tag) === ":" &&
    !isWildcard(tag) &&
    tagText(tag) !== null &&
    tagText(tag) !== ""
  );
}

export function walk(ast: ParserAst, visit: (tag: TagToken) => void): void {
  switch (ast.type) {
    case "Tag":
      visit(ast);
      return;
    case "LogicalExpression":
      walk(ast.left, visit);
      walk(ast.right, visit);
      return;
    case "UnaryOperator":
      walk(ast.operand, visit);
      return;
    case "ParenthesizedExpression":
      walk(ast.expression, visit);
      return;
    default:
      return;
  }
}

export function tags(ast: ParserAst): TagToken[] {
  const out: TagToken[] = [];
  walk(ast, (tag) => out.push(tag));
  return out;
}

export function unwrap(ast: ParserAst): ParserAst {
  let node = ast;
  while (node.type === "ParenthesizedExpression") node = node.expression;
  return node;
}

export function conjuncts(ast: ParserAst): ParserAst[] {
  const node = unwrap(ast);
  if (node.type === "LogicalExpression" && node.operator.operator === "AND") {
    return [...conjuncts(node.left), ...conjuncts(node.right)];
  }
  if (node.type === "EmptyExpression") return [];
  return [node];
}

export function disjuncts(ast: ParserAst): ParserAst[] {
  const node = unwrap(ast);
  if (node.type === "LogicalExpression" && node.operator.operator === "OR") {
    return [...disjuncts(node.left), ...disjuncts(node.right)];
  }
  return [node];
}

function spanOf(nodes: ParserAst[]): { start: number; end: number } {
  const located = nodes.flatMap((n) => ("location" in n ? [n.location] : []));
  if (located.length === 0) return { start: 0, end: 0 };
  return {
    start: Math.min(...located.map((l) => l.start)),
    end: Math.max(...located.map((l) => l.end)),
  };
}

function join(nodes: ParserAst[], operator: "AND" | "OR"): ParserAst | null {
  const [first, ...rest] = nodes;
  if (!first) return null;
  return rest.reduce<ParserAst>(
    (left, right) => ({
      type: "LogicalExpression",
      left,
      right,
      location: spanOf([left, right]),
      operator:
        operator === "AND"
          ? { type: "ImplicitBooleanOperator", operator: "AND" }
          : {
              type: "BooleanOperator",
              operator: "OR",
              location: spanOf([left]),
            },
    }),
    first,
  );
}

export function andAll(nodes: ParserAst[]): ParserAst | null {
  return join(nodes, "AND");
}

export function orAll(nodes: ParserAst[]): ParserAst | null {
  return join(nodes, "OR");
}

export function negate(node: ParserAst): ParserAst {
  return {
    type: "UnaryOperator",
    operator: "NOT",
    operand: node,
    location: spanOf([node]),
  };
}

export function retag(
  tag: TagToken,
  expression: ExpressionToken,
  field?: string,
  operator: Comparison = ":",
): TagToken {
  return {
    type: "Tag",
    location: tag.location,
    field: field
      ? {
          type: "Field",
          name: field,
          path: [field],
          quoted: false,
          location: tag.location,
        }
      : tag.field,
    operator: {
      type: "ComparisonOperator",
      location: (tag.operator as TagToken["operator"] | undefined)?.location ?? {
        start: tag.location.start,
        end: tag.location.start,
      },
      operator,
    },
    expression,
  };
}

export function numberLiteral(value: number, at: TagToken): ExpressionToken {
  return {
    type: "LiteralExpression",
    quoted: false,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- liqe's grammar emits number literal values and its comparison filter requires them, but its LiteralExpressionToken type omits number
    value: value as unknown as string,
    location: at.expression.location,
  };
}

export function regexLiteral(source: string, at: TagToken): ExpressionToken {
  return {
    type: "RegexExpression",
    value: source,
    location: at.expression.location,
  };
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

export function parenDepth(ast: ParserAst): number {
  switch (ast.type) {
    case "ParenthesizedExpression":
      return 1 + parenDepth(ast.expression);
    case "LogicalExpression":
      return Math.max(parenDepth(ast.left), parenDepth(ast.right));
    case "UnaryOperator":
      return parenDepth(ast.operand);
    default:
      return 0;
  }
}

export function positiveTags(ast: ParserAst): TagToken[] {
  return conjuncts(ast).flatMap((node) => (node.type === "Tag" ? [node] : []));
}
