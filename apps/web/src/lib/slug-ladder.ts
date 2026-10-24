function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function candidates(email: string, fallback: string): string[] {
  const at = email.lastIndexOf("@");
  const local = at === -1 ? email : email.slice(0, at);
  const domain = at === -1 ? "" : email.slice(at + 1);
  const localSlug = slugify(local) || fallback;
  const labels = domain.split(".").filter(Boolean);
  const sld = labels.length >= 2 ? slugify(labels[labels.length - 2] ?? "") : "";
  const fullDomain = slugify(domain);
  const out = [localSlug];
  if (sld && `${localSlug}-${sld}` !== localSlug) {
    out.push(`${localSlug}-${sld}`);
  }
  if (fullDomain && !out.includes(`${localSlug}-${fullDomain}`)) {
    out.push(`${localSlug}-${fullDomain}`);
  }
  return out;
}

function randomSuffix(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(3));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function climb(
  options: string[],
  fallback: string,
  isFree: (candidate: string) => boolean,
): string {
  for (const candidate of options) {
    if (isFree(candidate)) return candidate;
  }
  const root = options[0] ?? fallback;
  for (let i = 2; i < 20; i++) {
    const candidate = `${root}-${i}`;
    if (isFree(candidate)) return candidate;
  }
  return `${root}-${randomSuffix()}`;
}

export function uniqueSlug(opts: {
  taken: Set<string>;
  reserved: Set<string>;
  email: string;
  fallback: string;
}): string {
  return climb(
    candidates(opts.email, opts.fallback),
    opts.fallback,
    (candidate) => !opts.reserved.has(candidate) && !opts.taken.has(candidate),
  );
}

export function uniqueNameSlug(opts: {
  taken: Set<string>;
  name: string;
  fallback: string;
}): string {
  return climb(
    [slugify(opts.name) || opts.fallback],
    opts.fallback,
    (candidate) => !opts.taken.has(candidate),
  );
}
