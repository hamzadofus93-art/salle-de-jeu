import {
  getDashboardState,
  getHistory,
  getLeaderboard,
} from "../services/dashboard.service.mjs";

export async function dashboardStateController(request, response) {
  const state = await getDashboardState(request.query.limit);
  response.status(200).json(state);
}

export async function leaderboardController(_request, response) {
  const leaderboard = await getLeaderboard();
  response.status(200).json(leaderboard);
}

export async function historyController(request, response) {
  const history = await getHistory(request.query.limit);
  response.status(200).json(history);
}
