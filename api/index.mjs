let cachedAppPromise = null;

export default async function handler(request, response) {
  const app = await getApp();
  return app(request, response);
}

async function getApp() {
  if (!cachedAppPromise) {
    cachedAppPromise = buildApp().catch((error) => {
      console.error("Vercel API bootstrap failed:", error);
      return buildFallbackApp(error);
    });
  }

  return cachedAppPromise;
}

async function buildApp() {
  const [{ prepareRuntimeEnvironment }, { createVercelApiApp }, { ensureRuntimeSeed }] =
    await Promise.all([
      import("../server/src/bootstrap/runtime-environment.mjs"),
      import("../server/src/vercel-api-app.mjs"),
      import("../server/src/bootstrap/runtime-seed.mjs"),
    ]);

  await prepareRuntimeEnvironment();
  await ensureRuntimeSeed();

  return createVercelApiApp();
}

async function buildFallbackApp(error) {
  const { default: express } = await import("express");
  const app = express();

  app.use((_request, response) => {
    response.status(500).json({
      message: "API bootstrap failed.",
      details: error instanceof Error ? error.message : String(error),
    });
  });

  return app;
}
