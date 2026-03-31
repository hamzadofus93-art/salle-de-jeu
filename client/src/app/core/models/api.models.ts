export type UserRole = 'admin' | 'sudo' | 'user';
export type TableStatus = 'free' | 'occupied';
export type MatchStatus = 'active' | 'finished';
export type ReservationStatus = 'upcoming' | 'canceled';

export interface UserAccount {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LoginResponse {
  token: string;
  user: UserAccount;
}

export interface AuthMeResponse {
  user: UserAccount;
}

export interface WaitingPlayerEntry {
  id: string;
  playerName: string;
  position: number;
  createdAt: string;
}

export interface MatchRecord {
  id: string;
  tableId: string;
  discipline: string;
  format: string | null;
  note: string | null;
  playerOne: string;
  playerTwo: string;
  players: string[];
  winner: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  status: MatchStatus;
}

export interface DashboardTable {
  id: string;
  name: string;
  discipline: string;
  shortDiscipline: string;
  status: TableStatus;
  sessionsCompleted: number;
  lastWinner: string | null;
  lastEndedAt: string | null;
  currentMatch: MatchRecord | null;
  waitingPlayers: WaitingPlayerEntry[];
}

export interface LeaderboardRow {
  name: string;
  wins: number;
  poolWins: number;
  snookerWins: number;
  lastWinAt: string | null;
}

export interface HistoryRow extends MatchRecord {
  tableName: string | null;
}

export interface DashboardState {
  summary: {
    freeCount: number;
    activeCount: number;
    archiveCount: number;
    occupancyRate: number;
    topPlayer: LeaderboardRow | null;
  };
  tables: DashboardTable[];
  leaderboard: LeaderboardRow[];
  history: HistoryRow[];
  historyTotal: number;
}

export interface AccountsResponse {
  accounts: UserAccount[];
}

export interface DashboardResponse extends DashboardState {}

export interface TableResponse {
  table: DashboardTable;
}

export interface TablesResponse {
  tables: DashboardTable[];
}

export interface MatchActionResponse {
  match: MatchRecord;
  table: DashboardTable;
}

export interface ReservationRecord {
  id: string;
  tableId: string;
  tableName: string | null;
  discipline: string | null;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  note: string | null;
  status: ReservationStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: UserAccount | null;
}

export interface ReservationResponse {
  reservation: ReservationRecord;
}

export interface ReservationsResponse {
  reservations: ReservationRecord[];
}
