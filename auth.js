(function () {
  const SESSION_STORAGE_KEY = "club-manager-auth-v1";
  const ACCOUNTS_STORAGE_KEY = "club-manager-accounts-v1";
  const DEFAULT_ACCOUNTS = [
    {
      id: "seed-sudo-admin",
      username: "admin",
      password: "phoenix123",
      displayName: "Super Admin Phoenix",
      role: "sudo",
      isActive: true,
      createdAt: "2026-03-23T00:00:00.000Z",
    },
  ];

  function sanitizeCredential(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ");
  }

  function sanitizeUsername(value) {
    return sanitizeCredential(value)
      .replace(/\s+/g, "")
      .slice(0, 30);
  }

  function sanitizeDisplayName(value) {
    return sanitizeCredential(value).slice(0, 40);
  }

  function sanitizeRole(value) {
    return value === "sudo" ? "sudo" : "admin";
  }

  function usernamesMatch(left, right) {
    return sanitizeUsername(left).toLowerCase() === sanitizeUsername(right).toLowerCase();
  }

  function createEntityId(prefix = "account") {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `${prefix}-${crypto.randomUUID()}`;
    }

    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function createDefaultAccounts() {
    return DEFAULT_ACCOUNTS.map((account) => ({ ...account }));
  }

  function normalizeAccount(account) {
    const username = sanitizeUsername(account?.username);
    const password = sanitizeCredential(account?.password);
    const displayName = sanitizeDisplayName(account?.displayName) || username;

    if (!username || !password || !displayName) {
      return null;
    }

    return {
      id: account?.id || createEntityId(),
      username,
      password,
      displayName,
      role: sanitizeRole(account?.role),
      isActive: account?.isActive !== false,
      createdAt: account?.createdAt || new Date().toISOString(),
    };
  }

  function dedupeAccounts(accounts) {
    const uniqueAccounts = [];

    accounts.forEach((account) => {
      if (!uniqueAccounts.some((current) => usernamesMatch(current.username, account.username))) {
        uniqueAccounts.push(account);
      }
    });

    return uniqueAccounts;
  }

  function ensureAtLeastOneSudo(accounts) {
    if (accounts.some((account) => account.role === "sudo" && account.isActive)) {
      return accounts;
    }

    if (accounts.length === 0) {
      return createDefaultAccounts();
    }

    const nextAccounts = accounts.map((account) => ({ ...account }));
    const adminIndex = nextAccounts.findIndex((account) =>
      usernamesMatch(account.username, "admin"),
    );
    const targetIndex = adminIndex >= 0 ? adminIndex : 0;

    nextAccounts[targetIndex] = {
      ...nextAccounts[targetIndex],
      role: "sudo",
      isActive: true,
    };

    return nextAccounts;
  }

  function writeAccounts(accounts) {
    const nextRaw = JSON.stringify(accounts);
    window.localStorage.setItem(ACCOUNTS_STORAGE_KEY, nextRaw);
    return accounts;
  }

  function seedAccounts() {
    return writeAccounts(createDefaultAccounts());
  }

  function readAccounts() {
    const rawAccounts = window.localStorage.getItem(ACCOUNTS_STORAGE_KEY);

    if (!rawAccounts) {
      return seedAccounts();
    }

    try {
      const parsedAccounts = JSON.parse(rawAccounts);

      if (!Array.isArray(parsedAccounts)) {
        return seedAccounts();
      }

      const normalizedAccounts = dedupeAccounts(
        parsedAccounts.map(normalizeAccount).filter(Boolean),
      );
      const nextAccounts = ensureAtLeastOneSudo(normalizedAccounts);
      const nextRaw = JSON.stringify(nextAccounts);

      if (nextRaw !== rawAccounts) {
        window.localStorage.setItem(ACCOUNTS_STORAGE_KEY, nextRaw);
      }

      return nextAccounts;
    } catch {
      return seedAccounts();
    }
  }

  function stripSensitiveFields(account) {
    const { password, ...publicAccount } = account;
    return publicAccount;
  }

  function clearSession() {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  }

  function writeSession(account) {
    const nextSession = {
      id: account.id,
      username: account.username,
      displayName: account.displayName,
      role: account.role,
      loginAt: new Date().toISOString(),
    };

    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify(nextSession),
    );

    return nextSession;
  }

  function readSession() {
    const rawSession = window.localStorage.getItem(SESSION_STORAGE_KEY);

    if (!rawSession) {
      return null;
    }

    try {
      const parsedSession = JSON.parse(rawSession);
      const currentAccount = readAccounts().find((account) =>
        usernamesMatch(account.username, parsedSession?.username),
      );

      if (!currentAccount || !currentAccount.isActive) {
        clearSession();
        return null;
      }

      const nextSession = {
        id: currentAccount.id,
        username: currentAccount.username,
        displayName: currentAccount.displayName,
        role: currentAccount.role,
        loginAt: parsedSession?.loginAt || new Date().toISOString(),
      };
      const nextRaw = JSON.stringify(nextSession);

      if (nextRaw !== rawSession) {
        window.localStorage.setItem(SESSION_STORAGE_KEY, nextRaw);
      }

      return nextSession;
    } catch {
      clearSession();
      return null;
    }
  }

  function findAccountByCredentials(username, password) {
    const normalizedUsername = sanitizeUsername(username).toLowerCase();
    const normalizedPassword = sanitizeCredential(password);
    const account = readAccounts().find(
      (currentAccount) =>
        currentAccount.username.toLowerCase() === normalizedUsername,
    );

    if (!account) {
      return {
        ok: false,
        error: "Identifiant ou mot de passe incorrect.",
      };
    }

    if (!account.isActive) {
      return {
        ok: false,
        error: "Ce compte est desactive.",
      };
    }

    if (account.password !== normalizedPassword) {
      return {
        ok: false,
        error: "Identifiant ou mot de passe incorrect.",
      };
    }

    return {
      ok: true,
      account,
    };
  }

  function getActiveSudoCount(accounts) {
    return accounts.filter((account) => account.role === "sudo" && account.isActive)
      .length;
  }

  function createAccount(payload) {
    const actorSession = readSession();

    if (actorSession?.role !== "sudo") {
      return {
        ok: false,
        error: "Cette action est reservee aux comptes sudo.",
      };
    }

    const accounts = readAccounts();
    const nextAccount = normalizeAccount({
      displayName: payload?.displayName,
      username: payload?.username,
      password: payload?.password,
      role: payload?.role,
      isActive: true,
      createdAt: new Date().toISOString(),
    });

    if (!nextAccount) {
      return {
        ok: false,
        error: "Nom, identifiant et mot de passe sont obligatoires.",
      };
    }

    if (nextAccount.username.length < 3) {
      return {
        ok: false,
        error: "L'identifiant doit contenir au moins 3 caracteres.",
      };
    }

    if (nextAccount.password.length < 4) {
      return {
        ok: false,
        error: "Le mot de passe doit contenir au moins 4 caracteres.",
      };
    }

    if (
      accounts.some((account) => usernamesMatch(account.username, nextAccount.username))
    ) {
      return {
        ok: false,
        error: "Cet identifiant existe deja.",
      };
    }

    accounts.unshift(nextAccount);
    writeAccounts(accounts);

    return {
      ok: true,
      account: stripSensitiveFields(nextAccount),
    };
  }

  function setAccountStatus(accountId, isActive, actorUsername) {
    const actorSession = readSession();

    if (actorSession?.role !== "sudo") {
      return {
        ok: false,
        error: "Cette action est reservee aux comptes sudo.",
      };
    }

    const accounts = readAccounts();
    const accountIndex = accounts.findIndex((account) => account.id === accountId);

    if (accountIndex < 0) {
      return {
        ok: false,
        error: "Compte introuvable.",
      };
    }

    const account = accounts[accountIndex];
    const nextStatus = Boolean(isActive);

    if (usernamesMatch(account.username, actorUsername || actorSession.username)) {
      return {
        ok: false,
        error: "La session courante ne peut pas etre modifiee ici.",
      };
    }

    if (account.isActive === nextStatus) {
      return {
        ok: true,
        account: stripSensitiveFields(account),
      };
    }

    if (!nextStatus && account.role === "sudo" && getActiveSudoCount(accounts) <= 1) {
      return {
        ok: false,
        error: "Il faut conserver au moins un compte sudo actif.",
      };
    }

    accounts[accountIndex] = {
      ...account,
      isActive: nextStatus,
    };
    writeAccounts(accounts);

    return {
      ok: true,
      account: stripSensitiveFields(accounts[accountIndex]),
    };
  }

  function deleteAccount(accountId, actorUsername) {
    const actorSession = readSession();

    if (actorSession?.role !== "sudo") {
      return {
        ok: false,
        error: "Cette action est reservee aux comptes sudo.",
      };
    }

    const accounts = readAccounts();
    const accountIndex = accounts.findIndex((account) => account.id === accountId);

    if (accountIndex < 0) {
      return {
        ok: false,
        error: "Compte introuvable.",
      };
    }

    const account = accounts[accountIndex];

    if (usernamesMatch(account.username, actorUsername || actorSession.username)) {
      return {
        ok: false,
        error: "La session courante ne peut pas etre supprimee ici.",
      };
    }

    if (account.role === "sudo" && getActiveSudoCount(accounts) <= 1) {
      return {
        ok: false,
        error: "Impossible de supprimer le dernier compte sudo actif.",
      };
    }

    accounts.splice(accountIndex, 1);
    writeAccounts(accounts);

    return {
      ok: true,
    };
  }

  function getCurrentPageName() {
    const pathname = window.location.pathname || "";
    const segments = pathname.split("/");
    const lastSegment = segments[segments.length - 1];

    return lastSegment || "index.html";
  }

  function redirectTo(pathname) {
    const currentUrl = new URL(window.location.href);
    const nextUrl = new URL(pathname, currentUrl);

    if (currentUrl.href !== nextUrl.href) {
      window.location.replace(nextUrl.href);
    }
  }

  function guardCurrentPage() {
    const session = readSession();
    const isLoginPage = getCurrentPageName().toLowerCase() === "login.html";

    if (isLoginPage && session) {
      redirectTo("./index.html");
      return session;
    }

    if (!isLoginPage && !session) {
      redirectTo("./login.html");
      return null;
    }

    return session;
  }

  window.Auth = {
    getSession: readSession,
    getAccounts() {
      if (!readSession() || !this.isSudo()) {
        return [];
      }

      return readAccounts().map(stripSensitiveFields);
    },
    isSudo(session = readSession()) {
      return session?.role === "sudo";
    },
    login(username, password) {
      const result = findAccountByCredentials(username, password);

      if (!result.ok) {
        return result;
      }

      return {
        ok: true,
        session: writeSession(result.account),
      };
    },
    logout() {
      clearSession();
    },
    createAccount,
    setAccountStatus,
    deleteAccount,
    guardCurrentPage,
  };

  guardCurrentPage();
})();
