import { prisma } from "../db/prisma.mjs";
import { comparePassword, hashPassword } from "../utils/password.mjs";
import { toPublicUser } from "../utils/serializers.mjs";
import { badRequest, unauthorized } from "../utils/http-error.mjs";
import { sanitizeText, sanitizeUsername } from "../utils/normalize.mjs";
import { signAuthToken } from "../utils/token.mjs";

export async function login(payload) {
  const username = sanitizeUsername(payload?.username);
  const password = sanitizeText(payload?.password, 120);

  if (!username || !password) {
    throw unauthorized("Identifiant ou mot de passe incorrect.");
  }

  const user = await prisma.user.findUnique({
    where: { username },
    include: { managedTables: true },
  });

  if (!user || !user.isActive) {
    throw unauthorized("Identifiant ou mot de passe incorrect.");
  }

  const passwordMatches = await comparePassword(password, user.passwordHash);

  if (!passwordMatches) {
    throw unauthorized("Identifiant ou mot de passe incorrect.");
  }

  return {
    token: signAuthToken(user),
    user: toPublicUser(user),
  };
}

export async function getCurrentUser(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { managedTables: true },
  });

  if (!user || !user.isActive) {
    throw unauthorized("Session invalide ou compte desactive.");
  }

  return toPublicUser(user);
}

export async function updateCurrentUser(userId, payload) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { managedTables: true },
  });

  if (!user || !user.isActive) {
    throw unauthorized("Session invalide ou compte desactive.");
  }

  const displayName = sanitizeText(payload?.displayName, 40);
  const username = sanitizeUsername(payload?.username);
  const password = sanitizeText(payload?.password, 120);

  if (!displayName || !username) {
    throw badRequest("Nom et identifiant sont obligatoires.");
  }

  if (username.length < 3) {
    throw badRequest("L'identifiant doit contenir au moins 3 caracteres.");
  }

  if (password && password.length < 4) {
    throw badRequest("Le mot de passe doit contenir au moins 4 caracteres.");
  }

  if (username !== user.username) {
    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      throw badRequest("Cet identifiant existe deja.");
    }
  }

  const data = {
    displayName,
    username,
  };

  if (password) {
    data.passwordHash = await hashPassword(password);
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data,
    include: { managedTables: true },
  });

  return toPublicUser(updatedUser);
}
