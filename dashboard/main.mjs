import { appContext } from "./shared/context.mjs";
import { registerRender } from "./shared/render.mjs";
import {
  renderAccessControl,
  renderSession,
  handleLogout,
} from "./modules/session.mjs";
import { renderStats, renderActiveStrip } from "./modules/overview.mjs";
import {
  handleTablesGridClick,
  handleTablesGridSubmit,
  renderLobby,
  renderTables,
} from "./modules/tables.mjs";
import {
  focusStartPlayerField,
  handleFinishSubmit,
  handleStartSubmit,
  renderFinishForm,
  renderStartForm,
  syncStartFormForTable,
  updateFinishMatchDetails,
} from "./modules/matches.mjs";
import {
  handleResetData,
  renderHistory,
  renderLeaderboard,
} from "./modules/history.mjs";
import {
  handleAccountCreateSubmit,
  handleAccountListClick,
  renderAdminAccounts,
} from "./modules/accounts.mjs";
import { setActivePage } from "./modules/navigation.mjs";

function render() {
  renderSession();
  renderAccessControl();
  renderStats();
  renderActiveStrip();
  renderTables();
  renderLobby();
  renderStartForm();
  renderFinishForm();
  renderLeaderboard();
  renderHistory();
  renderAdminAccounts();
}

registerRender(render);

const { elements } = appContext;

elements.startForm?.addEventListener("submit", handleStartSubmit);
elements.startTable?.addEventListener("change", () => {
  syncStartFormForTable(elements.startTable.value);
  focusStartPlayerField();
});
elements.finishForm?.addEventListener("submit", handleFinishSubmit);
elements.finishTable?.addEventListener("change", updateFinishMatchDetails);
elements.resetData?.addEventListener("click", handleResetData);
elements.logoutButton?.addEventListener("click", handleLogout);
elements.accountForm?.addEventListener("submit", handleAccountCreateSubmit);
elements.accountsList?.addEventListener("click", handleAccountListClick);
elements.pageDeck?.addEventListener("click", handleTablesGridClick);
elements.pageDeck?.addEventListener("submit", handleTablesGridSubmit);
window.addEventListener("hashchange", () => {
  setActivePage(window.location.hash.replace("#", ""), { updateHash: false });
});

render();
setActivePage(window.location.hash.replace("#", "") || "home", {
  updateHash: !window.location.hash,
});
