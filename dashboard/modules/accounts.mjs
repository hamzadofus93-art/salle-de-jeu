import { appContext } from "../shared/context.mjs";
import { rerender } from "../shared/render.mjs";
import { showToast } from "../shared/toast.mjs";
import {
  accountUsernamesMatch,
  escapeAttribute,
  escapeHtml,
  formatDateTime,
} from "../shared/utils.mjs";
import { refreshSession, userIsSudo } from "./session.mjs";

export function renderAdminAccounts() {
  const { elements } = appContext;

  if (!elements.accountsSummary || !elements.accountsList) {
    return;
  }

  const canManageAccounts = userIsSudo();
  setAccountFormAvailability(canManageAccounts);
  renderAccountRoleChoices(canManageAccounts);

  if (!canManageAccounts) {
    elements.accountsSummary.innerHTML = `
      <article class="account-summary-card">
        <span>Acces</span>
        <strong>Restreint</strong>
        <p class="account-summary-note">
          Cette interface est reservee aux comptes sudo.
        </p>
      </article>
    `;
    elements.accountsList.innerHTML =
      '<p class="empty-state">La gestion des comptes n est visible que pour les utilisateurs sudo.</p>';

    if (elements.accountsAccessNote) {
      elements.accountsAccessNote.textContent =
        "Connecte-toi avec un compte sudo pour acceder a cette page.";
    }

    return;
  }

  const accounts = window.Auth?.getAccounts?.() || [];
  const activeAccounts = accounts.filter((account) => account.isActive).length;
  const sudoAccounts = accounts.filter((account) => account.role === "sudo").length;

  elements.accountsSummary.innerHTML = [
    createAccountSummaryMarkup({
      label: "Total comptes",
      value: String(accounts.length),
      note: "Tous les acces locaux configures sur cet appareil.",
    }),
    createAccountSummaryMarkup({
      label: "Comptes actifs",
      value: String(activeAccounts),
      note: "Comptes autorises a se connecter au dashboard.",
    }),
    createAccountSummaryMarkup({
      label: "Comptes sudo",
      value: String(sudoAccounts),
      note: "Peuvent creer, activer, desactiver et supprimer des comptes.",
    }),
  ].join("");

  elements.accountsList.innerHTML = accounts.length
    ? accounts.map((account) => createAccountCardMarkup(account, accounts)).join("")
    : '<p class="empty-state">Aucun compte configure pour le moment.</p>';

  if (elements.accountsAccessNote) {
    elements.accountsAccessNote.textContent =
      "Activation, desactivation et suppression reservees au sudo connecte.";
  }
}

export function handleAccountCreateSubmit(event) {
  const { elements } = appContext;
  event.preventDefault();

  if (!userIsSudo()) {
    showToast("Cette action est reservee aux comptes sudo.");
    return;
  }

  const formData = new FormData(elements.accountForm);
  const result = window.Auth?.createAccount?.({
    displayName: formData.get("displayName"),
    username: formData.get("username"),
    password: formData.get("password"),
    role: formData.get("role"),
  });

  if (!result?.ok) {
    showToast(result?.error || "Impossible de creer ce compte.");
    return;
  }

  elements.accountForm.reset();

  if (elements.accountRole) {
    elements.accountRole.value = "admin";
  }

  rerender();
  showToast(`Compte cree pour ${result.account.displayName}.`);
}

export function handleAccountFormClick(event) {
  const choiceButton = event.target.closest("button[data-account-role]");

  if (!choiceButton || choiceButton.disabled) {
    return;
  }

  appContext.elements.accountRole.value = choiceButton.dataset.accountRole || "admin";
  renderAccountRoleChoices(userIsSudo());
}

export function handleAccountListClick(event) {
  const actionButton = event.target.closest("button[data-account-action]");

  if (!actionButton) {
    return;
  }

  if (!userIsSudo()) {
    showToast("Cette action est reservee aux comptes sudo.");
    return;
  }

  const { accountAction, accountId, accountName } = actionButton.dataset;

  if (accountAction === "toggle-status") {
    const nextActive = actionButton.dataset.nextActive === "true";
    const confirmed = window.confirm(
      nextActive
        ? `Activer le compte ${accountName} ?`
        : `Desactiver le compte ${accountName} ?`,
    );

    if (!confirmed) {
      return;
    }

    const result = window.Auth?.setAccountStatus?.(
      accountId,
      nextActive,
      refreshSession()?.username,
    );

    if (!result?.ok) {
      showToast(result?.error || "Impossible de modifier ce compte.");
      return;
    }

    rerender();
    showToast(
      nextActive
        ? `${accountName} peut maintenant se connecter.`
        : `${accountName} a ete desactive.`,
    );
    return;
  }

  if (accountAction === "delete") {
    const confirmed = window.confirm(
      `Supprimer definitivement le compte ${accountName} ?`,
    );

    if (!confirmed) {
      return;
    }

    const result = window.Auth?.deleteAccount?.(
      accountId,
      refreshSession()?.username,
    );

    if (!result?.ok) {
      showToast(result?.error || "Impossible de supprimer ce compte.");
      return;
    }

    rerender();
    showToast(`Compte ${accountName} supprime.`);
  }
}

function createAccountSummaryMarkup({ label, value, note }) {
  return `
    <article class="account-summary-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <p class="account-summary-note">${escapeHtml(note)}</p>
    </article>
  `;
}

function createAccountCardMarkup(account, accounts) {
  const activeSession = refreshSession();
  const activeSudoCount = accounts.filter(
    (currentAccount) => currentAccount.role === "sudo" && currentAccount.isActive,
  ).length;
  const isCurrentSession = accountUsernamesMatch(
    account.username,
    activeSession?.username,
  );
  const isLastActiveSudo =
    account.role === "sudo" && account.isActive && activeSudoCount <= 1;
  const canToggle = !isCurrentSession && !isLastActiveSudo;
  const canDelete = !isCurrentSession && !isLastActiveSudo;
  const accessLabel =
    account.role === "sudo"
      ? "Dashboard Phoenix et gestion des comptes."
      : "Dashboard Phoenix sans acces a la page Comptes.";
  const stateNote = isCurrentSession
    ? "Session courante : ce compte ne peut pas etre modifie ici."
    : isLastActiveSudo
      ? "Dernier sudo actif : ce compte doit rester disponible."
      : account.isActive
        ? "Compte actif et autorise a se connecter."
        : "Compte desactive : connexion bloquee.";

  return `
    <article class="account-card" data-status="${account.isActive ? "active" : "inactive"}">
      <div class="account-card-head">
        <div class="account-heading">
          <div class="account-title-row">
            <h3 class="account-name">${escapeHtml(account.displayName)}</h3>
            <span class="detail-pill role-pill role-pill--${account.role}">
              ${escapeHtml(formatAccountRole(account.role))}
            </span>
          </div>
          <p class="account-meta">@${escapeHtml(account.username)}</p>
        </div>
        <span class="status-pill ${account.isActive ? "status-free" : "status-busy"}">
          ${account.isActive ? "Actif" : "Desactive"}
        </span>
      </div>

      <div class="account-facts">
        <span class="detail-pill subtle">Cree le ${formatDateTime(account.createdAt)}</span>
        <span class="detail-pill subtle">${escapeHtml(accessLabel)}</span>
      </div>

      <p class="account-note">${escapeHtml(stateNote)}</p>

      <div class="account-actions">
        <button
          type="button"
          class="secondary-button"
          data-account-action="toggle-status"
          data-account-id="${escapeAttribute(account.id)}"
          data-account-name="${escapeAttribute(account.displayName)}"
          data-next-active="${account.isActive ? "false" : "true"}"
          ${canToggle ? "" : "disabled"}
        >
          ${account.isActive ? "Desactiver" : "Activer"}
        </button>

        <button
          type="button"
          class="ghost-button"
          data-account-action="delete"
          data-account-id="${escapeAttribute(account.id)}"
          data-account-name="${escapeAttribute(account.displayName)}"
          ${canDelete ? "" : "disabled"}
        >
          Supprimer
        </button>
      </div>
    </article>
  `;
}

function setAccountFormAvailability(available) {
  const { elements } = appContext;

  if (!elements.accountForm) {
    return;
  }

  elements.accountForm
    .querySelectorAll("input, button, textarea")
    .forEach((field) => {
      field.disabled = !available;
    });
}

function formatAccountRole(role) {
  return role === "sudo" ? "Sudo" : "Admin";
}

function renderAccountRoleChoices(enabled) {
  const { elements } = appContext;

  if (!elements.accountRoleOptions || !elements.accountRole) {
    return;
  }

  const currentRole = elements.accountRole.value || "admin";

  elements.accountRoleOptions.innerHTML = [
    createRoleChoiceMarkup({
      role: "admin",
      title: "Admin",
      note: "Usage quotidien",
      active: currentRole === "admin",
      disabled: !enabled,
    }),
    createRoleChoiceMarkup({
      role: "sudo",
      title: "Sudo",
      note: "Gestion complete",
      active: currentRole === "sudo",
      disabled: !enabled,
    }),
  ].join("");
}

function createRoleChoiceMarkup({ role, title, note, active, disabled }) {
  return `
    <button
      type="button"
      class="choice-button ${active ? "is-active" : ""}"
      data-account-role="${escapeAttribute(role)}"
      ${disabled ? "disabled" : ""}
    >
      <span class="choice-copy">
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(note)}</small>
      </span>
    </button>
  `;
}
