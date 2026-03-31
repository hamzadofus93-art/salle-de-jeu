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
  handleFinishFormClick,
  handleFinishSubmit,
  handleStartFormClick,
  handleStartSubmit,
  renderFinishForm,
  renderStartForm,
} from "./modules/matches.mjs";
import {
  handleResetData,
  renderHistory,
  renderLeaderboard,
} from "./modules/history.mjs";
import {
  handleAccountCreateSubmit,
  handleAccountFormClick,
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
elements.startForm?.addEventListener("click", handleStartFormClick);
elements.finishForm?.addEventListener("submit", handleFinishSubmit);
elements.finishForm?.addEventListener("click", handleFinishFormClick);
elements.resetData?.addEventListener("click", handleResetData);
elements.logoutButton?.addEventListener("click", handleLogout);
elements.accountForm?.addEventListener("submit", handleAccountCreateSubmit);
elements.accountForm?.addEventListener("click", handleAccountFormClick);
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
