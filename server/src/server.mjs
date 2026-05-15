import { prepareRuntimeEnvironment } from "./bootstrap/runtime-environment.mjs";

await prepareRuntimeEnvironment();

const [
  { createApp },
  { env },
  { prisma },
  { ensureRuntimeSeed },
  { autoCloseExpiredPoolMatches },
  { autoCompleteExpiredPoolReservations },
] = await Promise.all([
  import("./app.mjs"),
  import("./config/env.mjs"),
  import("./db/prisma.mjs"),
  import("./bootstrap/runtime-seed.mjs"),
  import("./services/matches.service.mjs"),
  import("./services/reservations.service.mjs"),
]);

await ensureRuntimeSeed();
await runTimedCleanups();

const app = createApp();
const autoCloseIntervalId = setInterval(() => {
  void runTimedCleanups().catch((error) => {
    console.error("Echec de la cloture automatique des tables pool:", error);
  });
}, 30_000);

const server = app.listen(env.port, () => {
  console.log(`Phoenix Snooker app active sur http://localhost:${env.port}`);
});

async function shutdown(signal) {
  console.log(`Arret recu (${signal}), fermeture du serveur...`);
  clearInterval(autoCloseIntervalId);
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

async function runTimedCleanups() {
  await Promise.all([
    autoCloseExpiredPoolMatches(),
    autoCompleteExpiredPoolReservations(),
  ]);
}
