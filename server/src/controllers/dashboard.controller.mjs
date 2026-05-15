import {
  clearHistoryArchive,
  getDashboardState,
  getHistory,
  getLeaderboard,
} from "../services/dashboard.service.mjs";

export async function dashboardStateController(request, response) {
  const state = await getDashboardState(request.user, request.query.limit);
  response.status(200).json(state);
}

export async function leaderboardController(request, response) {
  const leaderboard = await getLeaderboard(request.user);
  response.status(200).json(leaderboard);
}

export async function historyController(request, response) {
  const history = await getHistory({
    actor: request.user,
    page: request.query.page,
    pageSize: request.query.pageSize ?? request.query.limit,
    discipline: request.query.discipline,
    search: request.query.search,
  });
  response.status(200).json(history);
}

export async function clearHistoryController(_request, response) {
  const result = await clearHistoryArchive();
  response.status(200).json(result);
}
