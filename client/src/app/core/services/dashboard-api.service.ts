import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { API_BASE_URL } from '../config/api.config';
import {
  AccountsResponse,
  DashboardResponse,
  MatchActionResponse,
  TableResponse,
} from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class DashboardApiService {
  private readonly http = inject(HttpClient);

  getDashboardState() {
    return this.http.get<DashboardResponse>(`${API_BASE_URL}/dashboard/state`);
  }

  getAccounts() {
    return this.http.get<AccountsResponse>(`${API_BASE_URL}/accounts`);
  }

  createAccount(payload: {
    displayName: string;
    username: string;
    password: string;
    role: string;
  }) {
    return this.http.post<{ account: AccountsResponse['accounts'][number] }>(
      `${API_BASE_URL}/accounts`,
      payload,
    );
  }

  updateAccountStatus(accountId: string, isActive: boolean) {
    return this.http.patch<{ account: AccountsResponse['accounts'][number] }>(
      `${API_BASE_URL}/accounts/${accountId}/status`,
      { isActive },
    );
  }

  deleteAccount(accountId: string) {
    return this.http.delete<void>(`${API_BASE_URL}/accounts/${accountId}`);
  }

  addWaitingPlayer(tableId: string, playerName: string) {
    return this.http.post<TableResponse>(
      `${API_BASE_URL}/tables/${tableId}/waiting-list`,
      { playerName },
    );
  }

  removeWaitingPlayer(tableId: string, entryId: string) {
    return this.http.delete<TableResponse>(
      `${API_BASE_URL}/tables/${tableId}/waiting-list/${entryId}`,
    );
  }

  startMatch(payload: {
    tableId: string;
    playerOne: string;
    playerTwo: string;
    durationMinutes?: number | null;
    note?: string;
  }) {
    return this.http.post<MatchActionResponse>(
      `${API_BASE_URL}/matches/start`,
      payload,
    );
  }

  finishMatch(matchId: string, payload: { winner: string; note?: string }) {
    return this.http.post<MatchActionResponse>(
      `${API_BASE_URL}/matches/${matchId}/finish`,
      payload,
    );
  }
}
