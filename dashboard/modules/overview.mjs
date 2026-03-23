import { TABLE_DEFINITIONS } from "../shared/config.mjs";
import { appContext } from "../shared/context.mjs";
import {
  getActiveTables,
  getFreeTables,
  getLeaderboardRows,
} from "../state/store.mjs";
import { escapeHtml, formatElapsedSince } from "../shared/utils.mjs";

export function renderStats() {
  const { elements, state } = appContext;
  const freeTables = getFreeTables(state);
  const activeTables = getActiveTables(state);
  const leaderboardRows = getLeaderboardRows(state);
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

export function renderActiveStrip() {
  const { elements, state } = appContext;
  const activeTables = getActiveTables(state);

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
