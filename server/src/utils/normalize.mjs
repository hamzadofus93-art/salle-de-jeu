export function sanitizeText(value, maxLength = 120) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

export function sanitizeUsername(value) {
  return sanitizeText(value, 30).replace(/\s+/g, "").toLowerCase();
}

export function namesMatch(left, right) {
  return sanitizeText(left, 60).toLowerCase() === sanitizeText(right, 60).toLowerCase();
}
