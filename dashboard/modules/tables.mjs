import { appContext } from "../shared/context.mjs";
import { rerender } from "../shared/render.mjs";
import { showToast } from "../shared/toast.mjs";
import { getTables, saveState } from "../state/store.mjs";
import {
  escapeAttribute,
  escapeHtml,
  formatDateTime,
  formatElapsedSince,
  namesMatch,
  sanitizeName,
} from "../shared/utils.mjs";
import { setActivePage } from "./navigation.mjs";
import {
  focusStartPlayerField,
  renderFinishForm,
  renderStartForm,
} from "./matches.mjs";

export function renderTables() {
  const { elements, state } = appContext;
  const poolTables = getTables(state).filter(
    (table) => table.discipline === "Pool anglais",
  );
  const snookerTables = getTables(state).filter(
    (table) => table.discipline === "Snooker",
  );

  elements.poolGrid.innerHTML = renderTableCards(poolTables);
  elements.snookerGrid.innerHTML = renderTableCards(snookerTables);
  elements.poolSummary.textContent = formatZoneSummary(poolTables);
  elements.snookerSummary.textContent = formatZoneSummary(snookerTables);
}

export function renderLobby() {
  const { elements, state } = appContext;
  const tables = getTables(state);
  const poolTables = tables.filter((table) => table.discipline === "Pool anglais");
  const snookerTables = tables.filter((table) => table.discipline === "Snooker");
  const totalWaitingPlayers = tables.reduce(
    (count, table) => count + (table.waitingPlayers?.length || 0),
    0,
  );

  elements.lobbySummary.textContent = `${totalWaitingPlayers} en attente`;
  elements.lobbyList.innerHTML = [
    createLobbySectionMarkup({
      title: "Section Pool",
      kicker: "Arena 01",
      tables: poolTables,
      theme: "pool",
    }),
    createLobbySectionMarkup({
      title: "Section Snooker",
      kicker: "Arena 02",
      tables: snookerTables,
      theme: "snooker",
    }),
  ].join("");
}

export function handleTablesGridClick(event) {
  const { elements, state } = appContext;
  const actionButton = event.target.closest("button[data-action]");

  if (actionButton) {
    const { action, tableId } = actionButton.dataset;

    if (action === "start") {
      elements.startTable.value = tableId;
      renderStartForm();
      setActivePage("start");
      focusStartPlayerField();
    } else if (action === "finish") {
      elements.finishTable.value = tableId;
      renderFinishForm();
      setActivePage("finish");
    }

    return;
  }

  const removeButton = event.target.closest("button[data-waiting-remove]");

  if (!removeButton) {
    return;
  }

  const table = state.tables[removeButton.dataset.tableId];
  const playerIndex = Number(removeButton.dataset.playerIndex);

  if (!table || !Number.isInteger(playerIndex)) {
    return;
  }

  const removedPlayer = table.waitingPlayers?.[playerIndex];

  if (!removedPlayer) {
    return;
  }

  table.waitingPlayers.splice(playerIndex, 1);
  saveState(state);
  rerender();
  showToast(`${removedPlayer} retire de la liste d'attente de ${table.name}.`);
}

export function handleTablesGridSubmit(event) {
  const { state } = appContext;
  const waitingForm = event.target;

  if (!waitingForm.matches("form[data-waiting-form]")) {
    return;
  }

  event.preventDefault();

  const table = state.tables[waitingForm.dataset.tableId];
  const playerField = waitingForm.querySelector('input[name="waitingPlayer"]');
  const playerName = sanitizeName(playerField?.value);

  if (!table) {
    showToast("Cette table n'est plus disponible.");
    rerender();
    return;
  }

  if (!playerName) {
    showToast("Indique le joueur a ajouter.");
    playerField?.focus();
    return;
  }

  if (table.waitingPlayers.some((player) => namesMatch(player, playerName))) {
    showToast("Ce joueur est deja dans la liste d'attente de cette table.");
    playerField?.select();
    return;
  }

  if (
    table.currentMatch?.players?.some((player) => namesMatch(player, playerName))
  ) {
    showToast("Ce joueur participe deja a la reservation en cours sur cette table.");
    playerField?.select();
    return;
  }

  table.waitingPlayers.push(playerName);
  saveState(state);
  rerender();
  showToast(`${playerName} ajoute a la liste d'attente de ${table.name}.`);
}

function renderTableCards(tables) {
  return tables.map((table) => createTableCardMarkup(table)).join("");
}

function createTableCardMarkup(table) {
  const isOccupied = table.status === "occupied";
  const currentMatch = table.currentMatch;
  const waitingPlayers = table.waitingPlayers || [];
  const playersText = currentMatch
    ? currentMatch.players.map(escapeHtml).join(" vs ")
    : "Disponible maintenant";
  const subline = isOccupied
    ? `Debut ${formatDateTime(currentMatch.startedAt)}`
    : `${escapeHtml(table.discipline)} pret pour une nouvelle reservation`;
  const noteText =
    currentMatch?.note ||
    (table.lastWinner
      ? `Dernier vainqueur: ${table.lastWinner}`
      : "Aucune note ajoutee pour cette table.");
  const timingTitle = isOccupied ? "En cours depuis" : "Derniere cloture";
  const timingLabel = isOccupied
    ? formatElapsedSince(currentMatch.startedAt)
    : table.lastEndedAt
      ? formatDateTime(table.lastEndedAt)
      : "Jamais";

  return `
    <article class="table-card" data-status="${table.status}">
      <div class="table-card-head">
        <div class="table-heading">
          <p class="discipline-pill">${table.shortDiscipline}</p>
          <h3 class="table-name">${table.name}</h3>
        </div>
        <span class="status-pill ${isOccupied ? "status-busy" : "status-free"}">
          ${isOccupied ? "Occupee" : "Libre"}
        </span>
      </div>

      <div class="table-spotlight">
        <p class="table-matchup">${playersText}</p>
        <p class="table-meta">${subline}</p>
      </div>

      <div class="table-facts">
        ${
          currentMatch?.format
            ? `<span class="detail-pill">${escapeHtml(currentMatch.format)}</span>`
            : `<span class="detail-pill subtle">${escapeHtml(table.discipline)}</span>`
        }
        <span class="detail-pill subtle">${table.sessionsCompleted} session(s)</span>
        <span class="detail-pill subtle">${waitingPlayers.length} en attente</span>
      </div>

      <div class="table-stats">
        <article>
          <span>Dernier vainqueur</span>
          <strong>${escapeHtml(table.lastWinner || "Aucun")}</strong>
        </article>
        <article>
          <span>${timingTitle}</span>
          <strong>${timingLabel}</strong>
        </article>
      </div>

      <p class="table-note">${escapeHtml(noteText)}</p>

      <div class="table-bottomline">
        <span class="table-footnote">
          ${isOccupied ? `Chrono: ${formatElapsedSince(currentMatch.startedAt)}` : "Disponible immediatement"}
        </span>
        <div class="table-actions">
          <button
            type="button"
            class="${isOccupied ? "secondary-button" : "primary-button"}"
            data-action="${isOccupied ? "finish" : "start"}"
            data-table-id="${table.id}"
          >
            ${isOccupied ? "Cloturer" : "Reserver"}
          </button>
        </div>
      </div>
    </article>
  `;
}

function formatZoneSummary(tables) {
  const occupiedCount = tables.filter((table) => table.status === "occupied").length;

  return `${tables.length} table(s), ${occupiedCount} active(s)`;
}

function createLobbySectionMarkup({ title, kicker, tables, theme }) {
  const waitingCount = tables.reduce(
    (count, table) => count + (table.waitingPlayers?.length || 0),
    0,
  );

  return `
    <section class="lobby-section lobby-section--${theme}">
      <div class="lobby-section-head">
        <div>
          <p class="section-kicker">${escapeHtml(kicker)}</p>
          <h3>${escapeHtml(title)}</h3>
        </div>
        <span class="detail-pill ${waitingCount ? "" : "subtle"}">
          ${waitingCount} en attente
        </span>
      </div>
      <div class="lobby-section-grid">
        ${tables.map((table) => createLobbyItemMarkup(table)).join("")}
      </div>
    </section>
  `;
}

function createLobbyItemMarkup(table) {
  const waitingPlayers = table.waitingPlayers || [];

  return `
    <article class="lobby-item">
      <div class="lobby-item-head">
        <div>
          <p class="discipline-pill">${table.shortDiscipline}</p>
          <h3 class="lobby-table-name">${escapeHtml(table.name)}</h3>
        </div>
        <span class="detail-pill subtle">${waitingPlayers.length} en attente</span>
      </div>

      ${
        waitingPlayers.length
          ? `
            <div class="waiting-list">
              ${waitingPlayers
                .map(
                  (player, index) => `
                    <article class="waiting-player">
                      <span class="waiting-order">${index + 1}</span>
                      <span class="waiting-name">${escapeHtml(player)}</span>
                      <button
                        type="button"
                        class="waiting-remove"
                        data-waiting-remove="true"
                        data-table-id="${table.id}"
                        data-player-index="${index}"
                        aria-label="Retirer ${escapeAttribute(player)} de la liste d'attente"
                      >
                        Retirer
                      </button>
                    </article>
                  `,
                )
                .join("")}
            </div>
          `
          : '<p class="empty-state compact">Aucun joueur en attente pour cette table.</p>'
      }

      <form class="waiting-form" data-waiting-form="true" data-table-id="${table.id}">
        <label class="waiting-label" for="waiting-player-${table.id}">
          Ajouter au lobby de cette table
        </label>
        <div class="waiting-input-row">
          <input
            id="waiting-player-${table.id}"
            name="waitingPlayer"
            type="text"
            maxlength="30"
            placeholder="Joueur"
          />
          <button type="submit" class="secondary-button">Ajouter</button>
        </div>
      </form>
    </article>
  `;
}
