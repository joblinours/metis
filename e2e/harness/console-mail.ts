import { type ConsoleMailHit, consoleMailSchema } from "../lib/console-mail";

const received: ConsoleMailHit[] = [];

export function consoleMailRoutes(token: string) {
  return {
    "/console-mail": {
      POST: async (req: Request) => {
        if (req.headers.get("authorization") !== `Bearer ${token}`) {
          return new Response("unauthorized\n", { status: 401 });
        }
        const body = consoleMailSchema.parse(await req.json());
        received.push({ ...body, at: new Date().toISOString() });
        return new Response(null, { status: 202 });
      },
    },
    "/console-mail-hits": {
      GET: () => Response.json(received),
      DELETE: () => {
        received.length = 0;
        return new Response(null, { status: 204 });
      },
    },
  };
}
