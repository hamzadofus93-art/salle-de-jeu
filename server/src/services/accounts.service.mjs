import { prisma } from "../db/prisma.mjs";
import { badRequest, forbidden, notFound } from "../utils/http-error.mjs";
import { sanitizeText, sanitizeUsername } from "../utils/normalize.mjs";
import { hashPassword } from "../utils/password.mjs";
import { toPublicUser } from "../utils/serializers.mjs";

export async function listAccounts() {
  const users = await prisma.user.findMany({
    include: { managedTables: true },
    orderBy: { createdAt: "asc" },
  });

  return users
    .sort((left, right) => {
      const roleDifference = getRolePriority(left.role) - getRolePriority(right.role);

      if (roleDifference !== 0) {
        return roleDifference;
      }

      return new Date(left.createdAt) - new Date(right.createdAt);
    })
    .map(toPublicUser);
}

export async function createAccount(actor, payload) {
  assertSudo(actor);

  const displayName = sanitizeText(payload?.displayName, 40);
  const username = sanitizeUsername(payload?.username);
  const password = sanitizeText(payload?.password, 120);
  const role = normalizeRole(payload?.role);
  const managedTableIds = await normalizeManagedTableIds(payload?.managedTableIds || payload?.tableIds);

  if (!displayName || !username || !password) {
    throw badRequest("Nom, identifiant et mot de passe sont obligatoires.");
  }

  if (username.length < 3) {
    throw badRequest("L'identifiant doit contenir au moins 3 caracteres.");
  }

  if (password.length < 4) {
    throw badRequest("Le mot de passe doit contenir au moins 4 caracteres.");
  }

  if (role === "ADMIN" && managedTableIds.length === 0) {
    throw badRequest("Assigne au moins une table a ce gestionnaire.");
  }

  const existingUser = await prisma.user.findUnique({
    where: { username },
  });

  if (existingUser) {
    throw badRequest("Cet identifiant existe deja.");
  }

  if (role === "ADMIN") {
    await assertManagedTablesAvailable(managedTableIds);
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      displayName,
      username,
      passwordHash,
      role,
      isActive: true,
      managedTables:
        role === "ADMIN"
          ? { connect: managedTableIds.map((id) => ({ id })) }
          : undefined,
    },
    include: { managedTables: true },
  });

  return toPublicUser(user);
}

export async function updateAccountStatus(actor, accountId, isActive) {
  assertSudo(actor);

  const user = await prisma.user.findUnique({
    where: { id: accountId },
  });

  if (!user) {
    throw notFound("Compte introuvable.");
  }

  if (user.id === actor.id) {
    throw forbidden("La session courante ne peut pas etre modifiee ici.");
  }

  const nextStatus = Boolean(isActive);

  if (!nextStatus && user.role === "SUDO") {
    const activeSudoCount = await prisma.user.count({
      where: {
        role: "SUDO",
        isActive: true,
      },
    });

    if (activeSudoCount <= 1) {
      throw badRequest("Il faut conserver au moins un compte sudo actif.");
    }
  }

  const updatedUser = await prisma.user.update({
    where: { id: accountId },
    data: {
      isActive: nextStatus,
    },
    include: { managedTables: true },
  });

  return toPublicUser(updatedUser);
}

export async function updateAccountManagedTables(actor, accountId, payload) {
  assertSudo(actor);

  const user = await prisma.user.findUnique({
    where: { id: accountId },
    include: { managedTables: true },
  });

  if (!user) {
    throw notFound("Compte introuvable.");
  }

  if (user.role !== "ADMIN") {
    throw badRequest("Les tables peuvent etre assignees uniquement a un gestionnaire.");
  }

  const managedTableIds = await normalizeManagedTableIds(
    payload?.managedTableIds || payload?.tableIds,
  );

  if (!managedTableIds.length) {
    throw badRequest("Assigne au moins une table a ce gestionnaire.");
  }

  await assertManagedTablesAvailable(managedTableIds, accountId);

  const updatedUser = await prisma.user.update({
    where: { id: accountId },
    data: {
      managedTables: {
        set: managedTableIds.map((id) => ({ id })),
      },
    },
    include: { managedTables: true },
  });

  return toPublicUser(updatedUser);
}

export async function deleteAccount(actor, accountId) {
  assertSudo(actor);

  const user = await prisma.user.findUnique({
    where: { id: accountId },
  });

  if (!user) {
    throw notFound("Compte introuvable.");
  }

  if (user.id === actor.id) {
    throw forbidden("La session courante ne peut pas etre supprimee ici.");
  }

  if (user.role === "SUDO" && user.isActive) {
    const activeSudoCount = await prisma.user.count({
      where: {
        role: "SUDO",
        isActive: true,
      },
    });

    if (activeSudoCount <= 1) {
      throw badRequest("Impossible de supprimer le dernier compte sudo actif.");
    }
  }

  await prisma.user.delete({
    where: { id: accountId },
  });
}

function normalizeRole(value) {
  const normalizedValue = String(value || "").toLowerCase();

  if (normalizedValue === "sudo") {
    return "SUDO";
  }

  if (normalizedValue === "user") {
    return "USER";
  }

  return "ADMIN";
}

function assertSudo(actor) {
  if (!actor || actor.role !== "SUDO") {
    throw forbidden("Action reservee aux comptes sudo.");
  }
}

async function normalizeManagedTableIds(value) {
  const requestedIds = Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);

  const uniqueIds = Array.from(
    new Set(
      requestedIds
        .map((entry) => sanitizeText(entry, 50))
        .filter(Boolean),
    ),
  );

  if (!uniqueIds.length) {
    return [];
  }

  const tables = await prisma.gameTable.findMany({
    where: {
      id: { in: uniqueIds },
    },
    select: { id: true },
  });

  if (tables.length !== uniqueIds.length) {
    throw badRequest("Une des tables assignees est introuvable.");
  }

  return uniqueIds;
}

async function assertManagedTablesAvailable(tableIds, accountIdToIgnore = null) {
  if (!tableIds.length) {
    return;
  }

  const unavailableTables = await prisma.gameTable.findMany({
    where: {
      id: { in: tableIds },
      managers: {
        some: {
          role: "ADMIN",
          ...(accountIdToIgnore ? { id: { not: accountIdToIgnore } } : {}),
        },
      },
    },
    include: {
      managers: {
        where: {
          role: "ADMIN",
          ...(accountIdToIgnore ? { id: { not: accountIdToIgnore } } : {}),
        },
        select: {
          displayName: true,
        },
      },
    },
  });

  if (!unavailableTables.length) {
    return;
  }

  const unavailableTableLabels = unavailableTables
    .map((table) => {
      const managerName = table.managers[0]?.displayName || "un autre gestionnaire";
      return `${table.name} (${managerName})`;
    })
    .join(", ");

  throw badRequest(
    `Table deja assignee a un autre gestionnaire: ${unavailableTableLabels}.`,
  );
}

function getRolePriority(role) {
  if (role === "SUDO") {
    return 0;
  }

  if (role === "ADMIN") {
    return 1;
  }

  return 2;
}
