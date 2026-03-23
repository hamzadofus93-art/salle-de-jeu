export function notFoundHandler(request, response) {
  response.status(404).json({
    message: `Route introuvable: ${request.method} ${request.originalUrl}`,
  });
}

export function errorHandler(error, _request, response, _next) {
  const statusCode = error.statusCode || 500;

  response.status(statusCode).json({
    message: error.message || "Erreur interne du serveur.",
    details: error.details || null,
  });
}
