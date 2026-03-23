export class HttpError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function badRequest(message, details = null) {
  return new HttpError(400, message, details);
}

export function unauthorized(message = "Authentification requise.") {
  return new HttpError(401, message);
}

export function forbidden(message = "Acces refuse.") {
  return new HttpError(403, message);
}

export function notFound(message = "Ressource introuvable.") {
  return new HttpError(404, message);
}
