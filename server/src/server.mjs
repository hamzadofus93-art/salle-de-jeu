import { prepareRuntimeEnvironment } from "./bootstrap/runtime-environment.mjs";

await prepareRuntimeEnvironment();

const [{ createApp }, { env }, { prisma }, { ensureRuntimeSeed }] = await Promise.all([
  import("./app.mjs"),
  import("./config/env.mjs"),
  import("./db/prisma.mjs"),
  import("./bootstrap/runtime-seed.mjs"),
]);

await ensureRuntimeSeed();

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`Phoenix Snooker app active sur http://localhost:${env.port}`);
});

async function shutdown(signal) {
  console.log(`Arret recu (${signal}), fermeture du serveur...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => {
  shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});
