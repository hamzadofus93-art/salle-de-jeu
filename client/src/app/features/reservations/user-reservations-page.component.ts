import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TimeoutError, firstValueFrom, timeout } from 'rxjs';
import {
  DashboardTable,
  WaitingPlayerEntry,
} from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { DashboardApiService } from '../../core/services/dashboard-api.service';

const REQUEST_TIMEOUT_MS = 8000;

interface MyWaitingEntry {
  table: DashboardTable;
  entry: WaitingPlayerEntry;
}

@Component({
  selector: 'app-user-reservations-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-reservations-page.component.html',
  styleUrl: './user-reservations-page.component.scss',
})
export class UserReservationsPageComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  readonly authService = inject(AuthService);
  private readonly dashboardApi = inject(DashboardApiService);
  private isDestroyed = false;

  protected tables: DashboardTable[] = [];
  protected isLoading = true;
  protected isRefreshing = false;
  protected isSubmitting = false;
  protected errorMessage = '';
  protected successMessage = '';
  protected readonly reservationForm = {
    tableId: '',
  };

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.isDestroyed = true;
    });
  }

  async ngOnInit(): Promise<void> {
    await this.loadReservations();
  }

  protected get user() {
    return this.authService.user();
  }

  protected get queueDisplayName(): string {
    return String(
      this.user?.displayName?.trim() || this.user?.username?.trim() || '',
    );
  }

  protected get myWaitingEntries(): MyWaitingEntry[] {
    const playerName = this.queueDisplayName;

    if (!playerName) {
      return [];
    }

    return this.tables.flatMap((table) =>
      table.waitingPlayers
        .filter((entry) => this.namesMatch(entry.playerName, playerName))
        .map((entry) => ({ table, entry })),
    );
  }

  protected get blockedTableIds(): string[] {
    return this.myWaitingEntries.map(({ table }) => table.id);
  }

  protected get availableTables(): DashboardTable[] {
    return this.tables.filter((table) => !this.blockedTableIds.includes(table.id));
  }

  protected get selectedTable(): DashboardTable | null {
    return this.tables.find((table) => table.id === this.reservationForm.tableId) ?? null;
  }

  protected get totalWaitingPlayers(): number {
    return this.tables.reduce((total, table) => total + table.waitingPlayers.length, 0);
  }

  protected get canCreateReservation(): boolean {
    return !this.isSubmitting
      && !!this.queueDisplayName
      && !!this.selectedTable
      && !this.blockedTableIds.includes(this.selectedTable.id);
  }

  protected waitingLabel(table: DashboardTable): string {
    if (!table.waitingPlayers.length) {
      return 'Aucun nom en attente';
    }

    if (table.waitingPlayers.length === 1) {
      return '1 nom en attente';
    }

    return `${table.waitingPlayers.length} noms en attente`;
  }

  protected async refresh(): Promise<void> {
    await this.loadReservations(true);
  }

  protected logout(): void {
    this.authService.logout(true);
  }

  protected async submitReservation(): Promise<void> {
    const table = this.selectedTable;
    const playerName = this.queueDisplayName;

    if (!playerName) {
      this.errorMessage = "Impossible de retrouver le nom du client connecte.";
      this.render();
      return;
    }

    if (!table) {
      this.errorMessage = 'Choisis une table.';
      this.render();
      return;
    }

    if (this.blockedTableIds.includes(table.id)) {
      this.errorMessage = 'Ton nom est deja dans la file d attente de cette table.';
      this.render();
      return;
    }

    this.clearAlerts();
    this.isSubmitting = true;
    this.render();

    try {
      await firstValueFrom(
        this.dashboardApi
          .addWaitingPlayer(table.id, playerName)
          .pipe(timeout(REQUEST_TIMEOUT_MS)),
      );

      this.resetReservationForm();
      await this.loadReservations(
        false,
        `${playerName} a ete ajoute a la file d attente de ${table.name}.`,
      );
    } catch (error) {
      this.handleError(error);
    } finally {
      this.isSubmitting = false;
      this.render();
    }
  }

  protected async cancelReservation(waitingEntry: MyWaitingEntry): Promise<void> {
    const confirmed = window.confirm(
      `Retirer ${waitingEntry.entry.playerName} de la file d attente de ${waitingEntry.table.name} ?`,
    );

    if (!confirmed) {
      return;
    }

    this.clearAlerts();
    this.isSubmitting = true;
    this.render();

    try {
      await firstValueFrom(
        this.dashboardApi
          .removeWaitingPlayer(waitingEntry.table.id, waitingEntry.entry.id)
          .pipe(timeout(REQUEST_TIMEOUT_MS)),
      );

      await this.loadReservations(
        false,
        `${waitingEntry.entry.playerName} a ete retire de ${waitingEntry.table.name}.`,
      );
    } catch (error) {
      this.handleError(error);
    } finally {
      this.isSubmitting = false;
      this.render();
    }
  }

  private async loadReservations(
    isRefresh = false,
    successMessage = '',
  ): Promise<void> {
    this.clearAlerts();
    this.isLoading = !isRefresh;
    this.isRefreshing = isRefresh;
    this.render();

    try {
      const tablesResponse = await firstValueFrom(
        this.dashboardApi.getTables().pipe(timeout(REQUEST_TIMEOUT_MS)),
      );

      this.tables = tablesResponse.tables;
      this.syncReservationForm();

      if (successMessage) {
        this.successMessage = successMessage;
      }
    } catch (error) {
      this.handleError(error);
    } finally {
      this.isLoading = false;
      this.isRefreshing = false;
      this.render();
    }
  }

  private clearAlerts(): void {
    this.errorMessage = '';
    this.successMessage = '';
  }

  private syncReservationForm(): void {
    if (!this.availableTables.some((table) => table.id === this.reservationForm.tableId)) {
      this.reservationForm.tableId = this.availableTables[0]?.id ?? '';
    }
  }

  private resetReservationForm(availableTables: DashboardTable[] = this.availableTables): void {
    this.reservationForm.tableId = availableTables[0]?.id ?? '';
  }

  private namesMatch(left: string, right: string): boolean {
    return this.normalizeName(left) === this.normalizeName(right);
  }

  private normalizeName(value: string): string {
    return String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  private handleError(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 401) {
      this.authService.logout(false);
      window.location.assign('/login');
      return;
    }

    this.errorMessage = extractHttpErrorMessage(error);
    this.render();
  }

  private render(): void {
    if (!this.isDestroyed) {
      this.cdr.detectChanges();
    }
  }
}

function extractHttpErrorMessage(error: unknown): string {
  if (error instanceof TimeoutError) {
    return 'Le serveur met trop de temps a repondre. Reessaie dans un instant.';
  }

  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return "Impossible de joindre le serveur. Lance l'application puis reessaie.";
    }

    return error.error?.message || error.message || 'Action impossible pour le moment.';
  }

  return 'Action impossible pour le moment.';
}
