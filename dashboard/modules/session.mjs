import { appContext } from "../shared/context.mjs";

export function refreshSession() {
  appContext.activeSession = window.Auth?.getSession?.() || null;
  return appContext.activeSession;
}

export function userIsSudo() {
  return window.Auth?.isSudo?.(refreshSession()) || false;
}

export function renderSession() {
  const { elements } = appContext;
  const session = refreshSession();

  if (!elements.sessionUser) {
    return;
  }

  const displayName = session?.displayName || session?.username;
  elements.sessionUser.textContent = displayName || "Session locale";

  if (elements.sessionMeta) {
    const roleLabel = session?.role === "sudo" ? "Role: Sudo" : "Role: Admin";
    elements.sessionMeta.textContent = session
      ? `${roleLabel} | Acces au dashboard Phoenix`
      : "Acces au dashboard Phoenix";
  }
}

export function renderAccessControl() {
  const { elements } = appContext;
  const canManageAccounts = userIsSudo();

  if (elements.accountsTab) {
    elements.accountsTab.hidden = !canManageAccounts;
  }

  if (elements.accountsCaption) {
    elements.accountsCaption.textContent = canManageAccounts
      ? "Seuls les utilisateurs sudo peuvent creer et gerer les comptes."
      : "Acces reserve aux utilisateurs sudo.";
  }
}

export function handleLogout() {
  const confirmed = window.confirm("Se deconnecter du dashboard Phoenix ?");

  if (!confirmed) {
    return;
  }

  window.Auth?.logout?.();
  window.location.replace("./login.html");
}
