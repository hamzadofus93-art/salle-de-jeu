const STORAGE_KEY = "club-manager-state-v1";
const PAGE_NAMES = [
  "home",
  "pool",
  "snooker",
  "lobby",
  "start",
  "finish",
  "leaderboard",
  "history",
];

const TABLE_DEFINITIONS = [
  ...Array.from({ length: 6 }, (_, index) => ({
    id: `pool-${index + 1}`,
    name: `Phoenix Pool ${index + 1}`,
    discipline: "Pool anglais",
    shortDiscipline: "Pool",
  })),
  ...Array.from({ length: 3 }, (_, index) => ({
    id: `snooker-${index + 1}`,
    name: `Phoenix Snooker ${index + 1}`,
    discipline: "Snooker",
    shortDiscipline: "Snooker",
  })),
];

const elements = {
  freeCount: document.querySelector("#free-count"),
  activeCount: document.querySelector("#active-count"),
  archiveCount: document.querySelector("#archive-count"),
  topPlayer: document.querySelector("#top-player"),
  roomSummary: document.querySelector("#room-summary"),
  occupancyFill: document.querySelector("#occupancy-fill"),
  occupancyNote: document.querySelector("#occupancy-note"),
  activityCaption: document.querySelector("#activity-caption"),
  activeStrip: document.querySelector("#active-strip"),
  pageDeck: document.querySelector("#page-deck"),
  pageViews: Array.from(document.querySelectorAll(".page-view")),
  pageTabs: Array.from(document.querySelectorAll("[data-page-tab]")),
  poolGrid: document.querySelector("#pool-grid"),
  snookerGrid: document.querySelector("#snooker-grid"),
  poolSummary: document.querySelector("#pool-summary"),
  snookerSummary: document.querySelector("#snooker-summary"),
  lobbyList: document.querySelector("#lobby-list"),
  lobbySummary: document.querySelector("#lobby-summary"),
  leaderboard: document.querySelector("#leaderboard"),
  historyList: document.querySelector("#history-list"),
  historyCaption: document.querySelector("#history-caption"),
  startForm: document.querySelector("#start-form"),
  startTable: document.querySelector("#start-table"),
  startSubmit: document.querySelector("#start-submit"),
  playerOne: document.querySelector("#player-one"),
  playerTwo: document.querySelector("#player-two"),
  reservationPanel: document.querySelector("#reservation-panel"),
  reservationKicker: document.querySelector("#reservation-kicker"),
  reservationHint: document.querySelector("#reservation-hint"),
  poolDurationField: document.querySelector("#pool-duration-field"),
  poolDuration: document.querySelector("#pool-duration"),
  startNote: document.querySelector("#start-note"),
  finishEmpty: document.querySelector("#finish-empty"),
  finishForm: document.querySelector("#finish-form"),
  finishTable: document.querySelector("#finish-table"),
  winnerOptions: document.querySelector("#winner-options"),
  activeMatchSummary: document.querySelector("#active-match-summary"),
  finishNote: document.querySelector("#finish-note"),
  resetData: document.querySelector("#reset-data"),
  toast: document.querySelector("#toast"),
};

let state = loadState();
let toastTimer = null;

function createDefaultState() {
  const tables = Object.fromEntries(
    TABLE_DEFINITIONS.map((table) => [
      table.id,
      {
        ...table,
        status: "free",
        currentMatch: null,
        waitingPlayers: [],
        sessionsCompleted: 0,
        lastWinner: null,
        lastEndedAt: null,
      },
    ]),
  );

  return {
    tables,
    history: [],
  };
}

function loadState() {
  const fallback = createDefaultState();
  const rawValue = window.localStorage.getItem(STORAGE_KEY);

  if (!rawValue) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(rawValue);
    const nextTables = Object.fromEntries(
      TABLE_DEFINITIONS.map((table) => {
        const savedTable = parsed?.tables?.[table.id] || {};

        return [
          table.id,
          {
            ...table,
            status: savedTable.status === "occupied" ? "occupied" : "free",
            currentMatch: savedTable.currentMatch || null,
            waitingPlayers: normalizeWaitingPlayers(savedTable.waitingPlayers),
            sessionsCompleted: Number(savedTable.sessionsCompleted) || 0,
            lastWinner: savedTable.lastWinner || null,
            lastEndedAt: savedTable.lastEndedAt || null,
          },
        ];
      }),
    );

    return {
      tables: nextTables,
      history: Array.isArray(parsed?.history) ? parsed.history : [],
    };
  } catch {
    return fallback;
  }
}

function saveState() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getTables() {
  return Object.values(state.tables);
}

function getFreeTables() {
  return getTables().filter((table) => table.status === "free");
}

function getActiveTables() {
  return getTables().filter((table) => table.status === "occupied");
}

function getLeaderboardRows() {
  const scoreboard = new Map();

  state.history.forEach((match) => {
    const current = scoreboard.get(match.winner) || {
      name: match.winner,
      wins: 0,
      poolWins: 0,
      snookerWins: 0,
      lastWinAt: null,
    };

    current.wins += 1;

    if (match.discipline === "Pool anglais") {
      current.poolWins += 1;
    } else if (match.discipline === "Snooker") {
      current.snookerWins += 1;
    }

    current.lastWinAt = match.endedAt;
    scoreboard.set(match.winner, current);
  });

  return Array.from(scoreboard.values()).sort((left, right) => {
    if (right.wins !== left.wins) {
      return right.wins - left.wins;
    }

    return new Date(right.lastWinAt) - new Date(left.lastWinAt);
  });
}

function render() {
  renderStats();
  renderActiveStrip();
  renderTables();
  renderLobby();
  renderStartForm();
  renderFinishForm();
  renderLeaderboard();
  renderHistory();
}

function renderStats() {
  const freeTables = getFreeTables();
  const activeTables = getActiveTables();
  const leaderboardRows = getLeaderboardRows();
  const topPlayer = leaderboardRows[0];
  const totalMatches = state.history.length;
  const occupancyRate = Math.round(
    (activeTables.length / TABLE_DEFINITIONS.length) * 100,
  );

  elements.freeCount.textContent = String(freeTables.length);
  elements.activeCount.textContent = String(activeTables.length);
  elements.archiveCount.textContent = String(totalMatches);
  elements.topPlayer.textContent = topPlayer
    ? `${topPlayer.name} (${topPlayer.wins})`
    : "Aucun leader";
  elements.roomSummary.textContent = `${freeTables.length} libres, ${activeTables.length} en cours, ${totalMatches} match(s) archives.`;
  elements.activityCaption.textContent = activeTables.length
    ? `${activeTables.length} session(s) actuellement en cours.`
    : "Aucune reservation en cours.";

  elements.occupancyFill.style.width = `${occupancyRate}%`;

  if (activeTables.length === 0) {
    elements.occupancyNote.textContent =
      "La salle est totalement disponible pour accueillir une nouvelle reservation.";
  } else if (activeTables.length === TABLE_DEFINITIONS.length) {
    elements.occupancyNote.textContent =
      "Toutes les tables sont occupees. Le prochain depart attend une cloture.";
  } else {
    elements.occupancyNote.textContent = `${activeTables.length} table(s) occupee(s) sur ${TABLE_DEFINITIONS.length}.`;
  }
}

function renderActiveStrip() {
  const activeTables = getActiveTables();

  if (activeTables.length === 0) {
    elements.activeStrip.innerHTML =
      '<p class="empty-state compact">Les tables actives apparaitront ici des qu une reservation commencera.</p>';
    return;
  }

  elements.activeStrip.innerHTML = activeTables
    .map((table) => {
      const match = table.currentMatch;

      return `
        <article class="active-badge">
          <strong>${escapeHtml(table.name)}</strong>
          <span>${match.players.map(escapeHtml).join(" vs ")}</span>
          <small>${escapeHtml(table.discipline)} | Depuis ${formatElapsedSince(match.startedAt)}</small>
        </article>
      `;
    })
    .join("");
}

function normalizePageName(pageName) {
  return PAGE_NAMES.includes(pageName) ? pageName : "home";
}

function setActivePage(pageName, options = {}) {
  const { updateHash = true } = options;
  const nextPage = normalizePageName(pageName);

  elements.pageViews.forEach((pageView) => {
    const isActive = pageView.dataset.page === nextPage;

    pageView.hidden = !isActive;
    pageView.classList.toggle("is-active", isActive);
  });

  elements.pageTabs.forEach((pageTab) => {
    pageTab.classList.toggle("is-active", pageTab.dataset.pageTab === nextPage);
  });

  if (updateHash) {
    const nextHash = `#${nextPage}`;

    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, "", nextHash);
    }
  }
}

function renderTables() {
  const poolTables = getTables().filter(
    (table) => table.discipline === "Pool anglais",
  );
  const snookerTables = getTables().filter(
    (table) => table.discipline === "Snooker",
  );

  elements.poolGrid.innerHTML = renderTableCards(poolTables);
  elements.snookerGrid.innerHTML = renderTableCards(snookerTables);
  elements.poolSummary.textContent = formatZoneSummary(poolTables);
  elements.snookerSummary.textContent = formatZoneSummary(snookerTables);
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

function renderLobby() {
  const tables = getTables();
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

function handleTablesGridClick(event) {
  const actionButton = event.target.closest("button[data-action]");

  if (actionButton) {
    const { action, tableId } = actionButton.dataset;

    if (action === "start") {
      elements.startTable.value = tableId;
      syncStartFormForTable(tableId);
      setActivePage("start");
      focusStartPlayerField();
    } else if (action === "finish") {
      elements.finishTable.value = tableId;
      updateFinishMatchDetails();
      setActivePage("finish");
      elements.finishTable.focus();
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
  saveState();
  render();
  showToast(`${removedPlayer} retire de la liste d'attente de ${table.name}.`);
}

function handleTablesGridSubmit(event) {
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
    render();
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
  saveState();
  render();
  showToast(`${playerName} ajoute a la liste d'attente de ${table.name}.`);
}

function renderStartForm() {
  const freeTables = getFreeTables();

  if (freeTables.length === 0) {
    elements.startTable.innerHTML =
      '<option value="">Aucune table libre</option>';
    elements.startTable.disabled = true;
    resetPlayerSelect(elements.playerOne, "Choisir Joueur 1");
    resetPlayerSelect(elements.playerTwo, "Choisir Joueur 2");
    elements.startSubmit.disabled = true;
    elements.startSubmit.textContent = "Salle complete";
    syncReservationFields("");
    return;
  }

  const currentValue = elements.startTable.value;
  elements.startTable.disabled = false;
  elements.startSubmit.disabled = false;
  elements.startSubmit.textContent = "Reserver la table";
  elements.startTable.innerHTML = freeTables
    .map(
      (table) =>
        `<option value="${table.id}">${table.name} - ${table.discipline}</option>`,
    )
    .join("");

  if (freeTables.some((table) => table.id === currentValue)) {
    elements.startTable.value = currentValue;
  }

  syncStartFormForTable(elements.startTable.value);
}

function syncStartFormForTable(tableId) {
  syncStartPlayerOptions(tableId);
  syncReservationFields(tableId);
}

function syncStartPlayerOptions(tableId) {
  const table = state.tables[tableId];
  const waitingPlayers = table?.waitingPlayers || [];
  const knownPlayers = table ? getKnownPlayers(tableId) : [];
  const hasEnoughPlayers = knownPlayers.length >= 2;

  setPlayerSelectOptions(elements.playerOne, {
    players: knownPlayers,
    placeholder: "Choisir Joueur 1",
    preferredValue: waitingPlayers[0],
  });

  setPlayerSelectOptions(elements.playerTwo, {
    players: knownPlayers,
    placeholder: "Choisir Joueur 2",
    preferredValue: waitingPlayers[1],
  });

  elements.playerOne.disabled = !table || knownPlayers.length === 0;
  elements.playerTwo.disabled = !table || knownPlayers.length === 0;
  elements.startSubmit.disabled = !hasEnoughPlayers;
  elements.startSubmit.textContent = hasEnoughPlayers
    ? "Reserver la table"
    : "Ajoute 2 joueurs au lobby";
}

function syncReservationFields(tableId) {
  const table = state.tables[tableId];
  const discipline = table?.discipline;
  const isPool = discipline === "Pool anglais";
  const isSnooker = discipline === "Snooker";
  const hasWaitingPlayers = Boolean(table?.waitingPlayers?.length);
  const hasEnoughPlayers = getKnownPlayers(tableId).length >= 2;

  elements.reservationPanel.hidden = !table;

  if (!table) {
    elements.poolDuration.required = false;
    elements.poolDurationField.hidden = true;
    elements.poolDuration.value = "";
    return;
  }

  if (isPool) {
    elements.reservationKicker.textContent = "Reservation pool";
    elements.reservationHint.textContent =
      hasWaitingPlayers
        ? "Choisis les joueurs dans la liste puis la duree. Les joueurs en attente sont proposes en priorite."
        : "Choisis deux joueurs dans la liste puis la duree de reservation.";
  } else if (isSnooker) {
    elements.reservationKicker.textContent = "Reservation snooker";
    elements.reservationHint.textContent =
      hasWaitingPlayers
        ? "Choisis simplement les joueurs dans la liste. Les joueurs en attente sont proposes en priorite."
        : "Pour le snooker, selectionne simplement deux joueurs dans la liste.";
  } else {
    elements.reservationKicker.textContent = "Reservation";
    elements.reservationHint.textContent =
      "Renseigne les informations de reservation pour cette table.";
  }

  if (!hasEnoughPlayers) {
    elements.reservationHint.textContent =
      "Ajoute d'abord au moins deux joueurs dans le lobby pour pouvoir les selectionner ici.";
  }

  elements.poolDurationField.hidden = !isPool;
  elements.poolDuration.required = isPool;

  if (isPool && !elements.poolDuration.value) {
    elements.poolDuration.value = "60";
  }

  if (!isPool) {
    elements.poolDuration.value = "";
  }
}

function focusStartPlayerField() {
  elements.playerOne.focus();
}

function getKnownPlayers(priorityTableId = "") {
  const knownPlayers = [];
  const priorityTable = state.tables[priorityTableId];

  priorityTable?.waitingPlayers?.forEach((player) => {
    appendUniquePlayer(knownPlayers, player);
  });

  getTables().forEach((table) => {
    if (table.id !== priorityTableId) {
      table.waitingPlayers?.forEach((player) => {
        appendUniquePlayer(knownPlayers, player);
      });
    }

    table.currentMatch?.players?.forEach((player) => {
      appendUniquePlayer(knownPlayers, player);
    });

    appendUniquePlayer(knownPlayers, table.lastWinner);
  });

  state.history.forEach((match) => {
    appendUniquePlayer(knownPlayers, match.playerOne);
    appendUniquePlayer(knownPlayers, match.playerTwo);
    appendUniquePlayer(knownPlayers, match.winner);
  });

  return knownPlayers;
}

function appendUniquePlayer(players, player) {
  const normalizedPlayer = sanitizeName(player);

  if (!normalizedPlayer) {
    return;
  }

  if (
    !players.some((currentPlayer) => namesMatch(currentPlayer, normalizedPlayer))
  ) {
    players.push(normalizedPlayer);
  }
}

function setPlayerSelectOptions(
  selectElement,
  { players, placeholder, preferredValue = "" },
) {
  const currentValue = sanitizeName(selectElement.value);
  const nextValue =
    findMatchingPlayer(players, currentValue)
    || findMatchingPlayer(players, preferredValue)
    || "";

  selectElement.innerHTML = [
    `<option value="">${escapeHtml(placeholder)}</option>`,
    ...players.map(
      (player) =>
        `<option value="${escapeAttribute(player)}">${escapeHtml(player)}</option>`,
    ),
  ].join("");

  selectElement.value = nextValue;
}

function resetPlayerSelect(selectElement, placeholder) {
  selectElement.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>`;
  selectElement.value = "";
  selectElement.disabled = true;
}

function findMatchingPlayer(players, value) {
  const normalizedValue = sanitizeName(value);

  if (!normalizedValue) {
    return "";
  }

  return players.find((player) => namesMatch(player, normalizedValue)) || "";
}

function getStartFormat(table) {
  if (!table) {
    return "";
  }

  if (table.discipline !== "Pool anglais") {
    return "";
  }

  const duration = Number.parseInt(elements.poolDuration.value, 10);

  if (!Number.isFinite(duration) || duration < 15) {
    return "";
  }

  return `${duration} min`;
}

function renderFinishForm() {
  const activeTables = getActiveTables();

  if (activeTables.length === 0) {
    elements.finishEmpty.hidden = false;
    elements.finishForm.hidden = true;
    elements.finishTable.innerHTML = "";
    elements.winnerOptions.innerHTML = "";
    elements.activeMatchSummary.innerHTML = "";
    return;
  }

  elements.finishEmpty.hidden = true;
  elements.finishForm.hidden = false;

  const currentValue = elements.finishTable.value;
  elements.finishTable.innerHTML = activeTables
    .map(
      (table) =>
        `<option value="${table.id}">${table.name} - ${table.currentMatch.players.map(escapeHtml).join(" vs ")}</option>`,
    )
    .join("");

  if (activeTables.some((table) => table.id === currentValue)) {
    elements.finishTable.value = currentValue;
  }

  updateFinishMatchDetails();
}

function renderLeaderboard() {
  const rows = getLeaderboardRows();

  if (rows.length === 0) {
    elements.leaderboard.innerHTML =
      '<p class="empty-state">Le classement apparaitra des qu une premiere partie sera cloturee.</p>';
    return;
  }

  elements.leaderboard.innerHTML = rows
    .map(
      (row, index) => `
        <article class="leaderboard-item ${index === 0 ? "is-leading" : ""}">
          <div class="leaderboard-rank">${index + 1}</div>
          <div>
            <div class="leaderboard-topline">
              <h3 class="leaderboard-name">${escapeHtml(row.name)}</h3>
              <span class="leaderboard-chip">${row.wins} victoire(s)</span>
            </div>
            <p class="leaderboard-meta">
              ${row.poolWins} victoire(s) en pool, ${row.snookerWins} en snooker.
            </p>
            <p class="leaderboard-meta">
              Derniere victoire: ${formatDateTime(row.lastWinAt)}
            </p>
          </div>
          <div class="leaderboard-score">
            <strong>${row.wins}</strong>
            <span>score</span>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderHistory() {
  const recentMatches = state.history.slice(0, 8);

  if (recentMatches.length === 0) {
    elements.historyList.innerHTML =
      '<p class="empty-state">Aucune partie enregistree pour le moment.</p>';
    elements.historyCaption.textContent =
      "Les derniers matchs enregistres apparaitront ici.";
    return;
  }

  elements.historyCaption.textContent = `${state.history.length} match(s) archives. Les 8 plus recents sont affiches ici.`;
  elements.historyList.innerHTML = recentMatches
    .map(
      (match) => `
        <article class="history-item">
          <div class="history-main">
            <div class="history-tags">
              <span class="history-badge">${escapeHtml(match.discipline)}</span>
              <span class="history-badge subtle">${formatDuration(match.durationMinutes)}</span>
              ${
                match.format
                  ? `<span class="history-badge subtle">${escapeHtml(match.format)}</span>`
                  : ""
              }
            </div>
            <h3 class="history-title">${escapeHtml(match.tableName)}</h3>
            <p class="history-meta">
              ${escapeHtml(match.playerOne)} vs ${escapeHtml(match.playerTwo)}
            </p>
            <p class="history-meta">
              Vainqueur: <strong>${escapeHtml(match.winner)}</strong>
            </p>
            ${
              match.note
                ? `<p class="history-note">${escapeHtml(match.note)}</p>`
                : ""
            }
          </div>
          <div class="history-side">
            <p class="history-side-title">Chronologie</p>
            <p class="history-meta">Debut: ${formatDateTime(match.startedAt)}</p>
            <p class="history-meta">Fin: ${formatDateTime(match.endedAt)}</p>
            <p class="history-meta">Duree: ${formatDuration(match.durationMinutes)}</p>
          </div>
        </article>
      `,
    )
    .join("");
}

function updateFinishMatchDetails() {
  const tableId = elements.finishTable.value;
  const table = state.tables[tableId];

  if (!table?.currentMatch) {
    elements.activeMatchSummary.innerHTML = "";
    elements.winnerOptions.innerHTML = "";
    return;
  }

  const match = table.currentMatch;

  elements.activeMatchSummary.innerHTML = `
    <p class="summary-title">${escapeHtml(table.name)}</p>
    <p class="summary-line">${match.players.map(escapeHtml).join(" vs ")}</p>
    <p class="summary-line">Debut: ${formatDateTime(match.startedAt)}</p>
    <p class="summary-line">Discipline: ${escapeHtml(table.discipline)}</p>
    ${
      match.format
        ? `<p class="summary-line">Reservation: ${escapeHtml(match.format)}</p>`
        : ""
    }
  `;

  elements.winnerOptions.innerHTML = match.players
    .map(
      (player, index) => `
        <label class="winner-option">
          <input
            type="radio"
            name="winner"
            value="${escapeAttribute(player)}"
            ${index === 0 ? "checked" : ""}
            required
          />
          <span>${escapeHtml(player)}</span>
        </label>
      `,
    )
    .join("");
}

function handleStartSubmit(event) {
  event.preventDefault();

  const tableId = elements.startTable.value;
  const playerOne = sanitizeName(elements.playerOne.value);
  const playerTwo = sanitizeName(elements.playerTwo.value);
  const note = elements.startNote.value.trim();
  const table = state.tables[tableId];
  const format = getStartFormat(table);

  if (!table || table.status !== "free") {
    showToast("Cette table n'est plus disponible.");
    render();
    return;
  }

  if (!playerOne || !playerTwo) {
    showToast("Les deux joueurs sont obligatoires.");
    return;
  }

  if (playerOne.toLowerCase() === playerTwo.toLowerCase()) {
    showToast("Merci d'indiquer deux joueurs differents.");
    return;
  }

  if (table.discipline === "Pool anglais" && !format) {
    showToast("Indique une duree valide pour la reservation pool.");
    return;
  }

  table.status = "occupied";
  table.waitingPlayers = (table.waitingPlayers || []).filter(
    (name) => !namesMatch(name, playerOne) && !namesMatch(name, playerTwo),
  );
  table.currentMatch = {
    players: [playerOne, playerTwo],
    startedAt: new Date().toISOString(),
    format,
    note,
  };

  saveState();
  elements.startForm.reset();
  render();
  showToast(`Reservation enregistree sur ${table.name}.`);
}

function handleFinishSubmit(event) {
  event.preventDefault();

  const tableId = elements.finishTable.value;
  const table = state.tables[tableId];

  if (!table?.currentMatch) {
    showToast("Aucune partie active sur cette table.");
    render();
    return;
  }

  const formData = new FormData(elements.finishForm);
  const winner = sanitizeName(formData.get("winner"));
  const finishNote = elements.finishNote.value.trim();
  const endedAt = new Date().toISOString();
  const startedAt = table.currentMatch.startedAt;
  const durationMinutes = Math.max(
    1,
    Math.round((new Date(endedAt) - new Date(startedAt)) / 60000),
  );

  if (!winner) {
    showToast("Choisis le vainqueur de la partie.");
    return;
  }

  state.history.unshift({
    id: createMatchId(),
    tableId: table.id,
    tableName: table.name,
    discipline: table.discipline,
    format: table.currentMatch.format || "",
    playerOne: table.currentMatch.players[0],
    playerTwo: table.currentMatch.players[1],
    winner,
    startedAt,
    endedAt,
    durationMinutes,
    note: finishNote || table.currentMatch.note || "",
  });

  table.status = "free";
  table.sessionsCompleted += 1;
  table.lastWinner = winner;
  table.lastEndedAt = endedAt;
  table.currentMatch = null;

  saveState();
  elements.finishForm.reset();
  render();
  showToast(`Victoire enregistree pour ${winner}.`);
}

function handleResetData() {
  const confirmed = window.confirm(
    "Reinitialiser les parties, l'historique et le classement ?",
  );

  if (!confirmed) {
    return;
  }

  state = createDefaultState();
  saveState();
  elements.startForm.reset();
  elements.finishForm.reset();
  render();
  showToast("Les donnees locales ont ete reinitialisees.");
}

function createMatchId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `match-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sanitizeName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeWaitingPlayers(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const uniquePlayers = [];

  value.forEach((player) => {
    const normalizedPlayer = sanitizeName(player);

    if (
      normalizedPlayer &&
      !uniquePlayers.some((currentPlayer) =>
        namesMatch(currentPlayer, normalizedPlayer),
      )
    ) {
      uniquePlayers.push(normalizedPlayer);
    }
  });

  return uniquePlayers;
}

function namesMatch(left, right) {
  return sanitizeName(left).toLowerCase() === sanitizeName(right).toLowerCase();
}

function formatDateTime(isoValue) {
  if (!isoValue) {
    return "-";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(isoValue));
}

function formatDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "-";
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (rest === 0) {
    return `${hours} h`;
  }

  return `${hours} h ${rest} min`;
}

function formatElapsedSince(isoValue) {
  if (!isoValue) {
    return "-";
  }

  const elapsedMinutes = Math.max(
    1,
    Math.round((Date.now() - new Date(isoValue).getTime()) / 60000),
  );

  return formatDuration(elapsedMinutes);
}

function scrollToSection(element) {
  if (!element || typeof element.scrollIntoView !== "function") {
    return;
  }

  element.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");

  if (toastTimer) {
    window.clearTimeout(toastTimer);
  }

  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("visible");
  }, 2600);
}

elements.startForm.addEventListener("submit", handleStartSubmit);
elements.startTable.addEventListener("change", () => {
  syncStartFormForTable(elements.startTable.value);
  focusStartPlayerField();
});
elements.finishForm.addEventListener("submit", handleFinishSubmit);
elements.finishTable.addEventListener("change", updateFinishMatchDetails);
elements.resetData.addEventListener("click", handleResetData);
elements.pageDeck.addEventListener("click", handleTablesGridClick);
elements.pageDeck.addEventListener("submit", handleTablesGridSubmit);
window.addEventListener("hashchange", () => {
  setActivePage(window.location.hash.replace("#", ""), { updateHash: false });
});

render();
setActivePage(window.location.hash.replace("#", "") || "home", {
  updateHash: !window.location.hash,
});
