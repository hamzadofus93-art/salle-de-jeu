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

  protected get tablesWithWaiting(): DashboardTable[] {
    return this.queueTables.filter((table) => table.waitingPlayers.length > 0);
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
