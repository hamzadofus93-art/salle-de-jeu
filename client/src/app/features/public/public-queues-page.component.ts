import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { TimeoutError, firstValueFrom, timeout } from 'rxjs';
import { DashboardTable } from '../../core/models/api.models';
import { DashboardApiService } from '../../core/services/dashboard-api.service';

const REQUEST_TIMEOUT_MS = 8000;

@Component({
  selector: 'app-public-queues-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './public-queues-page.component.html',
  styleUrl: './public-queues-page.component.scss',
})
export class PublicQueuesPageComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dashboardApi = inject(DashboardApiService);
  private isDestroyed = false;

  protected tables: DashboardTable[] = [];
  protected fullscreenTableId = '';
  protected isLoading = true;
  protected isRefreshing = false;
  protected errorMessage = '';

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.isDestroyed = true;
    });
  }

  async ngOnInit(): Promise<void> {
    await this.loadQueues();
  }

  protected get queueTables(): DashboardTable[] {
    return [...this.tables].sort((left, right) => {
      const waitingDifference =
        right.waitingPlayers.length - left.waitingPlayers.length;

      if (waitingDifference !== 0) {
        return waitingDifference;
      }

      return left.name.localeCompare(right.name, 'fr', {
        numeric: true,
        sensitivity: 'base',
      });
    });
  }

  protected get visibleTables(): DashboardTable[] {
    return this.queueTables.filter(
      (table) => table.waitingPlayers.length > 0 || !!table.currentMatch,
    );
  }

  protected get fullscreenTable(): DashboardTable | null {
    return this.visibleTables.find((table) => table.id === this.fullscreenTableId) ?? null;
  }

  protected waitingLabel(table: DashboardTable): string {
    if (!table.waitingPlayers.length) {
      return 'Aucun joueur en attente';
    }

    if (table.waitingPlayers.length === 1) {
      return '1 joueur en attente';
    }

    return `${table.waitingPlayers.length} joueurs en attente`;
  }

  protected nextWaitingPlayerName(table: DashboardTable): string {
    return table.waitingPlayers[0]?.playerName || '';
  }

  protected estimatedNextMatchStart(table: DashboardTable): number | null {
    if (
      table.discipline !== 'Pool anglais'
      || !table.currentMatch
      || !table.waitingPlayers.length
      || !table.currentMatch.durationMinutes
    ) {
      return null;
    }

    const startedAt = new Date(table.currentMatch.startedAt).getTime();

    if (!Number.isFinite(startedAt)) {
      return null;
    }

    return startedAt + table.currentMatch.durationMinutes * 60 * 1000;
  }

  protected openTableFullscreen(table: DashboardTable): void {
    this.fullscreenTableId = table.id;
    this.render();
  }

  protected closeTableFullscreen(): void {
    if (!this.fullscreenTableId) {
      return;
    }

    this.fullscreenTableId = '';
    this.render();
  }

  protected async refresh(): Promise<void> {
    await this.loadQueues(true);
  }

  private async loadQueues(isRefresh = false): Promise<void> {
    this.errorMessage = '';
    this.isLoading = !isRefresh;
    this.isRefreshing = isRefresh;
    this.render();

    try {
      const response = await firstValueFrom(
        this.dashboardApi.getPublicTables().pipe(timeout(REQUEST_TIMEOUT_MS)),
      );
      this.tables = response.tables;
      this.syncFullscreenTable();
    } catch (error) {
      this.errorMessage = extractHttpErrorMessage(error);
    } finally {
      this.isLoading = false;
      this.isRefreshing = false;
      this.render();
    }
  }

  private render(): void {
    if (!this.isDestroyed) {
      this.cdr.detectChanges();
    }
  }

  private syncFullscreenTable(): void {
    if (!this.fullscreenTableId) {
      return;
    }

    const hasVisibleTable = this.tables.some(
      (table) =>
        table.id === this.fullscreenTableId
        && (table.waitingPlayers.length > 0 || !!table.currentMatch),
    );

    if (!hasVisibleTable) {
      this.fullscreenTableId = '';
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

    return error.error?.message || error.message || 'Chargement impossible.';
  }

  return 'Chargement impossible.';
}
