import { appContext } from "../shared/context.mjs";
import { rerender } from "../shared/render.mjs";
import { showToast } from "../shared/toast.mjs";
import {
  createDefaultState,
  getLeaderboardRows,
  saveState,
} from "../state/store.mjs";
import {
  escapeHtml,
  formatDateTime,
  formatDuration,
} from "../shared/utils.mjs";

export function renderLeaderboard() {
  const { elements, state } = appContext;
  const rows = getLeaderboardRows(state);

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

export function renderHistory() {
  const { elements, state } = appContext;
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

export function handleResetData() {
  const { elements } = appContext;
  const confirmed = window.confirm(
    "Reinitialiser les parties, l'historique et le classement ?",
  );

  if (!confirmed) {
    return;
  }

  appContext.state = createDefaultState();
  saveState(appContext.state);
  elements.startForm.reset();
  elements.finishForm.reset();
  rerender();
  showToast("Les donnees locales ont ete reinitialisees.");
}
