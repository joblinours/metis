import { env } from "../lib/env";
import { seedCalendar, seedStressCalendar } from "../seed/calendar";
import { seedFiles } from "../seed/files";
import { seedMail } from "../seed/mail";
import { rejections } from "../seed/report";
import { ftpSink } from "../seed/sinks/ftp";
import { s3Sink } from "../seed/sinks/s3";
import { sftpSink } from "../seed/sinks/sftp";
import { webdavSink } from "../seed/sinks/webdav";
import { consoleMailRoutes } from "./console-mail";
import { loadMastraSeedSql, loadSeedSql } from "./database";
import { handleLlm, listHits, listMisses, listModels, llmSeedCount } from "./llm";
import { pixelRoutes } from "./pixels";
import { loadEnrollment, totpRoutes } from "./totp";

const PORT = 8080;

const enrollment = await loadEnrollment();

await loadSeedSql();
await loadMastraSeedSql();

await seedMail(env.imap);
await seedCalendar(env.caldav);
await seedStressCalendar(env.caldavStress);
await seedFiles(await s3Sink(env.s3), { bulkConcurrency: 32 });
await seedFiles(await webdavSink(env.webdav));
await seedFiles(await ftpSink(env.ftp));
await seedFiles(await sftpSink(env.sftp));

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  idleTimeout: 255,
  routes: {
    "/health": new Response("ok\n"),
    "/v1/models": { GET: listModels },
    "/llm-misses": { GET: listMisses },
    "/llm-hits": { GET: listHits },
    "/v1/*": { POST: handleLlm },
    ...totpRoutes(enrollment),
    ...pixelRoutes(),
    ...consoleMailRoutes(env.consoleMail.token),
  },
  fetch: () =>
    new Response(
      "GET /health | /totp | /totp.json | /backup-codes | /account | /llm-misses | /llm-hits | GET /v1/models | POST /v1/* | /pixel/* | GET, DELETE /pixel-hits | POST /console-mail | GET, DELETE /console-mail-hits\n",
      { status: 404 },
    ),
});

console.log(
  JSON.stringify(
    {
      ready: `http://0.0.0.0:${PORT}`,
      signIn: "http://localhost:3000",
      email: enrollment.email,
      password: enrollment.password,
      totp: "curl -s http://localhost:8099/totp",
      llmSeeds: llmSeedCount(),
      mail: `/w/${enrollment.workspaceSlug}/m/${enrollment.mailboxSlug}/inbox`,
      calendar: `/w/${enrollment.workspaceSlug}/c/${enrollment.calendarSlug}`,
      drives: Object.fromEntries(
        Object.entries(enrollment.driveSlugs).map(([kind, slug]) => [
          kind,
          `/w/${enrollment.workspaceSlug}/d/${slug}`,
        ]),
      ),
      rejectedByTestServers: rejections(),
    },
    null,
    2,
  ),
);
