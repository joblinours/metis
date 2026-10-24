import type { FileSink } from "../files";

export interface WebdavTarget {
  url: string;
  user: string;
  pass: string;
}

const READY_ATTEMPTS = 60;
const READY_DELAY_MS = 1000;

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

export async function webdavSink(target: WebdavTarget): Promise<FileSink> {
  const base = target.url.endsWith("/") ? target.url : `${target.url}/`;
  const authorization = `Basic ${Buffer.from(`${target.user}:${target.pass}`).toString("base64")}`;
  const folders = new Map<string, Promise<void>>();

  async function request(
    method: string,
    path: string,
    body?: Uint8Array,
    contentType?: string,
  ): Promise<Response> {
    return fetch(new URL(encodePath(path), base), {
      method,
      headers: {
        authorization,
        ...(method === "PROPFIND" ? { depth: "0" } : {}),
        ...(contentType ? { "content-type": contentType } : {}),
      },
      body: body ?? null,
    });
  }

  for (let attempt = 1; ; attempt++) {
    const ready = await request("PROPFIND", "").catch(() => null);
    if (ready && (ready.status === 207 || ready.ok)) break;
    if (attempt >= READY_ATTEMPTS) {
      throw new Error(`WebDAV at ${base} never became ready (${ready?.status ?? "unreachable"})`);
    }
    await Bun.sleep(READY_DELAY_MS);
  }

  function ensureFolder(path: string): Promise<void> {
    if (!path) return Promise.resolve();
    const known = folders.get(path);
    if (known) return known;

    const parent = path.slice(0, path.slice(0, -1).lastIndexOf("/") + 1);
    const pending = (async () => {
      await ensureFolder(parent);
      const res = await request("MKCOL", path);
      if (!res.ok && res.status !== 405) {
        throw new Error(`MKCOL -> ${res.status}`);
      }
    })();
    folders.set(path, pending);
    return pending;
  }

  return {
    area: "webdav",
    label: `webdav ${base}`,
    async put(key, body, contentType) {
      if (key.endsWith("/")) {
        await ensureFolder(key);
        return;
      }
      await ensureFolder(key.slice(0, key.lastIndexOf("/") + 1));
      const res = await request("PUT", key, body, contentType);
      if (!res.ok) {
        throw new Error(`PUT -> ${res.status} ${await res.text()}`);
      }
    },
  };
}
