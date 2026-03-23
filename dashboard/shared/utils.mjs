export function sanitizeName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeWaitingPlayers(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const uniquePlayers = [];

  value.forEach((player) => {
    const normalizedPlayer = sanitizeName(player);

    if (
      normalizedPlayer &&
      !uniquePlayers.some((currentPlayer) =>
        namesMatch(currentPlayer, normalizedPlayer),
      )
    ) {
      uniquePlayers.push(normalizedPlayer);
    }
  });

  return uniquePlayers;
}

export function namesMatch(left, right) {
  return sanitizeName(left).toLowerCase() === sanitizeName(right).toLowerCase();
}

export function accountUsernamesMatch(left, right) {
  return String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase();
}

export function formatDateTime(isoValue) {
  if (!isoValue) {
    return "-";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(isoValue));
}

export function formatDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "-";
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (rest === 0) {
    return `${hours} h`;
  }

  return `${hours} h ${rest} min`;
}

export function formatElapsedSince(isoValue) {
  if (!isoValue) {
    return "-";
  }

  const elapsedMinutes = Math.max(
    1,
    Math.round((Date.now() - new Date(isoValue).getTime()) / 60000),
  );

  return formatDuration(elapsedMinutes);
}

export function scrollToSection(element) {
  if (!element || typeof element.scrollIntoView !== "function") {
    return;
  }

  element.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}
