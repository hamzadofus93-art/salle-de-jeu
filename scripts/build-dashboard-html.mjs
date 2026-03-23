import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const sourceDir = path.join(rootDir, "html", "dashboard");
const pagesDir = path.join(sourceDir, "pages");
const outputFile = path.join(rootDir, "index.html");

const pageFiles = [
  "home.html",
  "pool.html",
  "snooker.html",
  "lobby.html",
  "reservations.html",
  "performance.html",
  "accounts.html",
];

async function readRelativeFile(...segments) {
  const filePath = path.join(...segments);
  return fs.readFile(filePath, "utf8");
}

async function buildIndexHtml() {
  const [sidebar, ...pages] = await Promise.all([
    readRelativeFile(sourceDir, "sidebar.html"),
    ...pageFiles.map((fileName) => readRelativeFile(pagesDir, fileName)),
  ]);

  const pageMarkup = pages.join("\n\n");
  const nextDocument = `<!DOCTYPE html>
<!-- Generated from html/dashboard/* with scripts/build-dashboard-html.mjs -->
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Phoenix Snooker Club | Gestion de Salle</title>
    <link rel="stylesheet" href="./styles.css" />
    <script src="./auth.js"></script>
    <script src="./app.js" defer></script>
  </head>
  <body>
    <div class="app-shell">
${indentBlock(sidebar, 6)}
      <div class="workspace">
        <div id="page-deck" class="page-deck">
${indentBlock(pageMarkup, 10)}
        </div>
      </div>
    </div>

    <div id="toast" class="toast" aria-live="polite" aria-atomic="true"></div>
  </body>
</html>
`;

  await fs.writeFile(outputFile, nextDocument, "utf8");
}

function indentBlock(value, spaces) {
  const indent = " ".repeat(spaces);

  return value
    .trim()
    .split(/\r?\n/)
    .map((line) => `${indent}${line}`)
    .join("\n");
}

buildIndexHtml().catch((error) => {
  console.error("Impossible de reconstruire index.html", error);
  process.exitCode = 1;
});
