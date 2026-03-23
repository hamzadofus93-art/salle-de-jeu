import { prisma } from "../db/prisma.mjs";
import { comparePassword } from "../utils/password.mjs";
import { toPublicUser } from "../utils/serializers.mjs";
import { unauthorized } from "../utils/http-error.mjs";
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
  });

  if (!user || !user.isActive) {
    throw unauthorized("Session invalide ou compte desactive.");
  }

  return toPublicUser(user);
}
