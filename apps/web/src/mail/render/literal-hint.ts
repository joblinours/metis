const MIN_HINT = 3;

function skipClass(source: string, start: number): number {
  let i = start + 1;
  while (i < source.length && source[i] !== "]") {
    if (source[i] === "\\") i++;
    i++;
  }
  return i + 1;
}

function skipGroup(source: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < source.length) {
    const c = source[i];
    if (c === "\\") i += 2;
    else if (c === "[") i = skipClass(source, i);
    else {
      if (c === "(") depth++;
      else if (c === ")" && --depth === 0) return i + 1;
      i++;
    }
  }
  return i;
}

function hasTopLevelAlternation(source: string): boolean {
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === "\\") i += 2;
    else if (c === "[") i = skipClass(source, i);
    else if (c === "(") i = skipGroup(source, i);
    else if (c === "|") return true;
    else i++;
  }
  return false;
}

export function requiredLiteral(source: string): string | null {
  if (hasTopLevelAlternation(source)) return null;
  let best = "";
  let run = "";
  const flush = () => {
    if (run.length > best.length) best = run;
    run = "";
  };
  let i = 0;
  while (i < source.length) {
    const c = source[i] ?? "";
    if (c === "\\") {
      const next = source[i + 1] ?? "";
      if (/[A-Za-z0-9]/.test(next)) flush();
      else run += next;
      i += 2;
    } else if (c === "[") {
      flush();
      i = skipClass(source, i);
    } else if (c === "(") {
      flush();
      i = skipGroup(source, i);
    } else if (c === "?" || c === "*" || c === "+" || c === "{") {
      const optional = c === "?" || c === "*" || (c === "{" && /^\{0\s*[,}]/.test(source.slice(i)));
      if (optional) run = run.slice(0, -1);
      flush();
      if (c === "{") {
        const close = source.indexOf("}", i);
        i = close < 0 ? source.length : close + 1;
      } else {
        i++;
      }
      if (source[i] === "?") i++;
    } else if (c === "." || c === "^" || c === "$" || c === "|") {
      flush();
      i++;
    } else {
      run += c;
      i++;
    }
  }
  flush();
  return best.length >= MIN_HINT ? best.toLowerCase() : null;
}
