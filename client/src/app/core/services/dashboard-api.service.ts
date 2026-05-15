import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { API_BASE_URL } from '../config/api.config';
import {
  AccountsResponse,
  DashboardResponse,
  HistoryClearResponse,
  HistoryDisciplineFilter,
  HistoryResponse,
  MatchActionResponse,
  ReservationResponse,
  ReservationsResponse,
  TableResponse,
  TablesResponse,
} from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class DashboardApiService {
  private readonly http = inject(HttpClient);

  getDashboardState() {
    return this.http.get<DashboardResponse>(`${API_BASE_URL}/dashboard/state`);
  }

  getHistory(options?: {
    page?: number;
    pageSize?: number;
    discipline?: HistoryDisciplineFilter;
    search?: string;
  }) {
    let params = new HttpParams();

    if (options?.page) {
      params = params.set('page', String(options.page));
    }

    if (options?.pageSize) {
      params = params.set('pageSize', String(options.pageSize));
    }

    if (options?.discipline && options.discipline !== 'all') {
      params = params.set('discipline', options.discipline);
    }

    if (options?.search?.trim()) {
      params = params.set('search', options.search.trim());
    }

    return this.http.get<HistoryResponse>(`${API_BASE_URL}/dashboard/history`, {
      params,
    });
  }

  clearHistory() {
    return this.http.delete<HistoryClearResponse>(`${API_BASE_URL}/dashboard/history`);
  }

  getAccounts() {
    return this.http.get<AccountsResponse>(`${API_BASE_URL}/accounts`);
  }

  getTables() {
    return this.http.get<TablesResponse>(`${API_BASE_URL}/tables`);
  }

  getPublicTables() {
    return this.http.get<TablesResponse>(`${API_BASE_URL}/tables/public`);
  }

  getReservations() {
    return this.http.get<ReservationsResponse>(`${API_BASE_URL}/reservations`);
  }

  createAccount(payload: {
    displayName: string;
    username: string;
    password: string;
    role: string;
    managedTableIds?: string[];
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

  updateAccountManagedTables(accountId: string, managedTableIds: string[]) {
    return this.http.patch<{ account: AccountsResponse['accounts'][number] }>(
      `${API_BASE_URL}/accounts/${accountId}/managed-tables`,
      { managedTableIds },
    );
  }

  deleteAccount(accountId: string) {
    return this.http.delete<void>(`${API_BASE_URL}/accounts/${accountId}`);
  }

  createReservation(payload: {
    tableId: string;
    clientName: string;
    durationMinutes: number;
    note?: string;
  }) {
    return this.http.post<ReservationResponse>(
      `${API_BASE_URL}/reservations`,
      payload,
    );
  }

  updateReservation(
    reservationId: string,
    payload: {
      tableId: string;
      clientName?: string;
      startAt?: string;
      durationMinutes: number;
      note?: string;
    },
  ) {
    return this.http.patch<ReservationResponse>(
      `${API_BASE_URL}/reservations/${reservationId}`,
      payload,
    );
  }

  cancelReservation(reservationId: string) {
    return this.http.delete<ReservationResponse>(
      `${API_BASE_URL}/reservations/${reservationId}`,
    );
  }

  completeReservation(reservationId: string) {
    return this.http.post<ReservationResponse>(
      `${API_BASE_URL}/reservations/${reservationId}/complete`,
      {},
    );
  }

  addWaitingPlayer(tableId: string, playerName: string) {
    return this.http.post<TableResponse>(
      `${API_BASE_URL}/tables/${tableId}/waiting-list`,
      { playerName },
    );
  }

  createTable(payload: { discipline: 'pool' | 'snooker'; tableNumber: number }) {
    return this.http.post<TableResponse>(`${API_BASE_URL}/tables`, payload);
  }

  deleteTable(tableId: string) {
    const normalizedTableId = encodeURIComponent(tableId.trim());

    return this.http.delete<{ deletedTableId: string }>(
      `${API_BASE_URL}/tables/${normalizedTableId}`,
    );
  }

  removeWaitingPlayer(tableId: string, entryId: string) {
    return this.http.delete<TableResponse>(
      `${API_BASE_URL}/tables/${tableId}/waiting-list/${entryId}`,
    );
  }

  resetAllWaitingLists() {
    return this.http.delete<{ clearedCount: number }>(`${API_BASE_URL}/tables/waiting-list`);
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

  finishMatch(matchId: string, payload: { winner: string; note?: string; replay?: boolean }) {
    return this.http.post<MatchActionResponse>(
      `${API_BASE_URL}/matches/${matchId}/finish`,
      payload,
    );
  }
}
