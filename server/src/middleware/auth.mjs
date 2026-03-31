import { prisma } from "../db/prisma.mjs";
import { forbidden, unauthorized } from "../utils/http-error.mjs";
import { verifyAuthToken } from "../utils/token.mjs";

export async function requireAuth(request, _response, next) {
  try {
    const authorization = request.headers.authorization || "";
    const [scheme, token] = authorization.split(" ");

    if (scheme !== "Bearer" || !token) {
      throw unauthorized();
    }

    const payload = verifyAuthToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.isActive) {
      throw unauthorized("Session invalide ou compte desactive.");
    }

    request.user = user;
    next();
  } catch (error) {
    next(error.statusCode ? error : unauthorized("Token invalide."));
  }
}

export function requireSudo(request, _response, next) {
  if (!request.user || request.user.role !== "SUDO") {
    next(forbidden("Action reservee aux comptes sudo."));
    return;
  }

  next();
}

export function requireStaff(request, _response, next) {
  if (!request.user || !["ADMIN", "SUDO"].includes(request.user.role)) {
    next(forbidden("Action reservee a l'equipe Phoenix."));
    return;
  }

  next();
}
