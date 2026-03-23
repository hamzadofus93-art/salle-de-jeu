import { createApp } from "./app.mjs";
import { env } from "./config/env.mjs";
import { prisma } from "./db/prisma.mjs";

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
