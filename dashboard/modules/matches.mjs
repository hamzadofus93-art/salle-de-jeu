import { appContext } from "../shared/context.mjs";
import { rerender } from "../shared/render.mjs";
import { showToast } from "../shared/toast.mjs";
import {
  getActiveTables,
  getFreeTables,
  getTables,
  saveState,
} from "../state/store.mjs";
import {
  escapeAttribute,
  escapeHtml,
  formatDateTime,
  namesMatch,
  sanitizeName,
} from "../shared/utils.mjs";

export function renderStartForm() {
  const { elements, state } = appContext;
  const freeTables = getFreeTables(state);

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

export function syncStartFormForTable(tableId) {
  syncStartPlayerOptions(tableId);
  syncReservationFields(tableId);
}

export function focusStartPlayerField() {
  appContext.elements.playerOne.focus();
}

export function renderFinishForm() {
  const { elements, state } = appContext;
  const activeTables = getActiveTables(state);

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

export function updateFinishMatchDetails() {
  const { elements, state } = appContext;
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

export function handleStartSubmit(event) {
  const { elements, state } = appContext;
  event.preventDefault();

  const tableId = elements.startTable.value;
  const playerOne = sanitizeName(elements.playerOne.value);
  const playerTwo = sanitizeName(elements.playerTwo.value);
  const note = elements.startNote.value.trim();
  const table = state.tables[tableId];
  const format = getStartFormat(table);

  if (!table || table.status !== "free") {
    showToast("Cette table n'est plus disponible.");
    rerender();
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

  saveState(state);
  elements.startForm.reset();
  rerender();
  showToast(`Reservation enregistree sur ${table.name}.`);
}

export function handleFinishSubmit(event) {
  const { elements, state } = appContext;
  event.preventDefault();

  const tableId = elements.finishTable.value;
  const table = state.tables[tableId];

  if (!table?.currentMatch) {
    showToast("Aucune partie active sur cette table.");
    rerender();
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

  saveState(state);
  elements.finishForm.reset();
  rerender();
  showToast(`Victoire enregistree pour ${winner}.`);
}

function syncStartPlayerOptions(tableId) {
  const { elements, state } = appContext;
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
  const { elements, state } = appContext;
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

function getKnownPlayers(priorityTableId = "") {
  const { state } = appContext;
  const knownPlayers = [];
  const priorityTable = state.tables[priorityTableId];

  priorityTable?.waitingPlayers?.forEach((player) => {
    appendUniquePlayer(knownPlayers, player);
  });

  getTables(state).forEach((table) => {
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
  const { elements } = appContext;

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

function createMatchId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `match-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
