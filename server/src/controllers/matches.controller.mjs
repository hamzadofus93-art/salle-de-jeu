import { finishMatch, startMatch } from "../services/matches.service.mjs";

export async function startMatchController(request, response) {
  const result = await startMatch(request.body);
  response.status(201).json(result);
}

export async function finishMatchController(request, response) {
  const result = await finishMatch(request.params.matchId, request.body);
  response.status(200).json(result);
}
