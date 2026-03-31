import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TimeoutError, firstValueFrom, timeout } from 'rxjs';
import {
  DashboardTable,
  ReservationRecord,
} from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { DashboardApiService } from '../../core/services/dashboard-api.service';

const REQUEST_TIMEOUT_MS = 8000;

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
  protected reservations: ReservationRecord[] = [];
  protected isLoading = true;
  protected isRefreshing = false;
  protected isSubmitting = false;
  protected editingReservationId = '';
  protected errorMessage = '';
  protected successMessage = '';
  protected readonly reservationForm = {
    tableId: '',
    startAt: createSuggestedStartAtValue(),
    durationMinutes: 60,
    note: '',
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

  protected get myReservations(): ReservationRecord[] {
    const userId = this.user?.id;

    if (!userId) {
      return [];
    }

    return this.reservations.filter((reservation) => reservation.createdBy?.id === userId);
  }

  protected get editingReservation(): ReservationRecord | null {
    return (
      this.myReservations.find(
        (reservation) => reservation.id === this.editingReservationId,
      ) ?? null
    );
  }

  protected get blockedTableIds(): string[] {
    return this.myReservations.map((reservation) => reservation.tableId);
  }

  protected get availableTables(): DashboardTable[] {
    return this.tables.filter((table) => !this.blockedTableIds.includes(table.id));
  }

  protected get selectableTables(): DashboardTable[] {
    if (!this.editingReservation) {
      return this.availableTables;
    }

    return this.tables.filter(
      (table) =>
        table.id === this.editingReservation?.tableId
        || !this.myReservations.some(
          (reservation) =>
            reservation.id !== this.editingReservationId
            && reservation.tableId === table.id,
        ),
    );
  }

  protected get selectedTable(): DashboardTable | null {
    return this.tables.find((table) => table.id === this.reservationForm.tableId) ?? null;
  }

  protected get selectedTableAlreadyReservedByMe(): boolean {
    if (!this.selectedTable) {
      return false;
    }

    return this.myReservations.some(
      (reservation) =>
        reservation.id !== this.editingReservationId
        && reservation.tableId === this.selectedTable?.id,
    );
  }

  protected get canCreateReservation(): boolean {
    return !this.isSubmitting
      && !!this.reservationForm.tableId
      && !this.selectedTableAlreadyReservedByMe
      && this.selectableTables.length > 0;
  }

  protected get reservationActionTitle(): string {
    return this.editingReservation ? 'Modifier la reservation' : 'Faire une reservation';
  }

  protected get reservationSubmitLabel(): string {
    return this.editingReservation ? 'Enregistrer les changements' : 'Confirmer la reservation';
  }

  protected get minReservationStartAt(): string {
    return createSuggestedStartAtValue(30);
  }

  protected async refresh(): Promise<void> {
    await this.loadReservations(true);
  }

  protected logout(): void {
    this.authService.logout(true);
  }

  protected async submitReservation(): Promise<void> {
    const table = this.selectedTable;
    const startAt = parseLocalDateTimeValue(this.reservationForm.startAt);
    const durationMinutes = Number(this.reservationForm.durationMinutes);

    if (!table) {
      this.errorMessage = 'Choisis une table.';
      this.render();
      return;
    }

    if (this.selectedTableAlreadyReservedByMe) {
      this.errorMessage = 'Tu as deja une reservation visible sur cette table.';
      this.render();
      return;
    }

    if (!startAt) {
      this.errorMessage = 'Choisis une date et une heure valides.';
      this.render();
      return;
    }

    if (!Number.isFinite(durationMinutes) || durationMinutes < 30 || durationMinutes > 240) {
      this.errorMessage = 'La duree doit etre comprise entre 30 et 240 minutes.';
      this.render();
      return;
    }

    this.clearAlerts();
    this.isSubmitting = true;
    this.render();

    try {
      if (this.editingReservation) {
        await firstValueFrom(
          this.dashboardApi.updateReservation(this.editingReservation.id, {
            tableId: table.id,
            startAt: startAt.toISOString(),
            durationMinutes,
            note: this.reservationForm.note,
          }).pipe(timeout(REQUEST_TIMEOUT_MS)),
        );

        this.exitEditMode();
        await this.loadReservations(
          false,
          `Reservation mise a jour sur ${table.name}.`,
        );
      } else {
        await firstValueFrom(
          this.dashboardApi.createReservation({
            tableId: table.id,
            startAt: startAt.toISOString(),
            durationMinutes,
            note: this.reservationForm.note,
          }).pipe(timeout(REQUEST_TIMEOUT_MS)),
        );

        this.resetReservationForm();
        await this.loadReservations(false, `Reservation ajoutee sur ${table.name}.`);
      }
    } catch (error) {
      this.handleError(error);
    } finally {
      this.isSubmitting = false;
      this.render();
    }
  }

  protected startEditReservation(reservation: ReservationRecord): void {
    this.editingReservationId = reservation.id;
    this.reservationForm.tableId = reservation.tableId;
    this.reservationForm.startAt = formatDateTimeLocalValue(
      new Date(reservation.startAt),
    );
    this.reservationForm.durationMinutes = reservation.durationMinutes;
    this.reservationForm.note = reservation.note || '';
    this.clearAlerts();
    this.render();
  }

  protected exitEditMode(): void {
    this.editingReservationId = '';
    this.resetReservationForm();
    this.clearAlerts();
    this.render();
  }

  protected async cancelReservation(reservation: ReservationRecord): Promise<void> {
    const confirmed = window.confirm(
      `Annuler ta reservation sur ${reservation.tableName || 'cette table'} ?`,
    );

    if (!confirmed) {
      return;
    }

    this.clearAlerts();
    this.isSubmitting = true;
    this.render();

    try {
      await firstValueFrom(
        this.dashboardApi.cancelReservation(reservation.id).pipe(timeout(REQUEST_TIMEOUT_MS)),
      );

      if (this.editingReservationId === reservation.id) {
        this.exitEditMode();
      }

      await this.loadReservations(
        false,
        `Reservation annulee sur ${reservation.tableName || 'la table'}.`,
      );
    } catch (error) {
      this.handleError(error);
    } finally {
      this.isSubmitting = false;
      this.render();
    }
  }

  protected isMine(reservation: ReservationRecord): boolean {
    return reservation.createdBy?.id === this.user?.id;
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
      const [tablesResponse, reservationsResponse] = await Promise.all([
        firstValueFrom(
          this.dashboardApi.getTables().pipe(timeout(REQUEST_TIMEOUT_MS)),
        ),
        firstValueFrom(
          this.dashboardApi.getReservations().pipe(timeout(REQUEST_TIMEOUT_MS)),
        ),
      ]);

      this.tables = tablesResponse.tables;
      this.reservations = reservationsResponse.reservations;

      const availableTables = this.tables.filter(
        (table) => !this.myReservations.some((reservation) => reservation.tableId === table.id),
      );

      this.syncReservationForm(availableTables);

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

  private syncReservationForm(availableTables: DashboardTable[]): void {
    if (
      this.editingReservationId
      && !this.myReservations.some(
        (reservation) => reservation.id === this.editingReservationId,
      )
    ) {
      this.editingReservationId = '';
      this.resetReservationForm(availableTables);
      return;
    }

    if (
      this.editingReservation
      && !this.selectableTables.some(
        (table) => table.id === this.reservationForm.tableId,
      )
    ) {
      this.reservationForm.tableId = this.editingReservation.tableId;
      return;
    }

    if (!this.editingReservation) {
      if (!availableTables.some((table) => table.id === this.reservationForm.tableId)) {
        this.reservationForm.tableId = availableTables[0]?.id ?? '';
      }

      if (!this.reservationForm.startAt) {
        this.reservationForm.startAt = createSuggestedStartAtValue();
      }
    }
  }

  private resetReservationForm(availableTables: DashboardTable[] = this.availableTables): void {
    this.reservationForm.tableId = availableTables[0]?.id ?? '';
    this.reservationForm.startAt = createSuggestedStartAtValue();
    this.reservationForm.durationMinutes = 60;
    this.reservationForm.note = '';
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

function createSuggestedStartAtValue(offsetMinutes = 60): string {
  const now = new Date();
  now.setSeconds(0, 0);
  now.setMinutes(now.getMinutes() + offsetMinutes);

  return formatDateTimeLocalValue(now);
}

function formatDateTimeLocalValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseLocalDateTimeValue(value: string): Date | null {
  const date = new Date(String(value || ''));

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}
