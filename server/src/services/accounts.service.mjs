import { prisma } from "../db/prisma.mjs";
import { badRequest, forbidden, notFound } from "../utils/http-error.mjs";
import { sanitizeText, sanitizeUsername } from "../utils/normalize.mjs";
import { hashPassword } from "../utils/password.mjs";
import { toPublicUser } from "../utils/serializers.mjs";

export async function listAccounts() {
  const users = await prisma.user.findMany({
    orderBy: [
      { role: "desc" },
      { createdAt: "asc" },
    ],
  });

  return users.map(toPublicUser);
}

export async function createAccount(actor, payload) {
  assertSudo(actor);

  const displayName = sanitizeText(payload?.displayName, 40);
  const username = sanitizeUsername(payload?.username);
  const password = sanitizeText(payload?.password, 120);
  const role = normalizeRole(payload?.role);

  if (!displayName || !username || !password) {
    throw badRequest("Nom, identifiant et mot de passe sont obligatoires.");
  }

  if (username.length < 3) {
    throw badRequest("L'identifiant doit contenir au moins 3 caracteres.");
  }

  if (password.length < 4) {
    throw badRequest("Le mot de passe doit contenir au moins 4 caracteres.");
  }

  const existingUser = await prisma.user.findUnique({
    where: { username },
  });

  if (existingUser) {
    throw badRequest("Cet identifiant existe deja.");
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      displayName,
      username,
      passwordHash,
      role,
      isActive: true,
    },
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
  return String(value || "").toLowerCase() === "sudo" ? "SUDO" : "ADMIN";
}

function assertSudo(actor) {
  if (!actor || actor.role !== "SUDO") {
    throw forbidden("Action reservee aux comptes sudo.");
  }
}
