import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/auth/server";

export const { GET, POST } = toNextJsHandler((request) => getAuth().handler(request));
