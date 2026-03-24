import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TimeoutError, firstValueFrom, timeout } from 'rxjs';
import {
  DashboardState,
  DashboardTable,
  MatchRecord,
  UserAccount,
  UserRole,
  WaitingPlayerEntry,
} from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { DashboardApiService } from '../../core/services/dashboard-api.service';

type DashboardSection =
  | 'overview'
  | 'tables'
  | 'matches'
  | 'performance'
  | 'accounts';

const REQUEST_TIMEOUT_MS = 8000;

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
})
export class DashboardPageComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  readonly authService = inject(AuthService);
  private readonly dashboardApi = inject(DashboardApiService);
  private isDestroyed = false;

  protected dashboardState: DashboardState | null = null;
  protected accounts: UserAccount[] = [];
  protected activeSection: DashboardSection = 'overview';
  protected isLoading = true;
  protected isRefreshing = false;
  protected errorMessage = '';
  protected successMessage = '';
  protected waitingDrafts: Record<string, string> = {};
  protected readonly startForm = {
    tableId: '',
    playerOne: '',
    playerTwo: '',
    durationMinutes: 60,
    note: '',
  };
  protected readonly finishForm = {
    matchId: '',
    winner: '',
    note: '',
  };
  protected readonly accountForm = {
    displayName: '',
    username: '',
    password: '',
    role: 'admin' as UserRole,
  };

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.isDestroyed = true;
    });
  }

  async ngOnInit(): Promise<void> {
    await this.loadDashboard();
  }

  protected get user(): UserAccount | null {
    return this.authService.user();
  }

  protected get isSudo(): boolean {
    return this.authService.isSudo();
  }

  protected get summary() {
    return this.dashboardState?.summary ?? null;
  }

  protected get tables(): DashboardTable[] {
    return this.dashboardState?.tables ?? [];
  }

  protected get freeTables(): DashboardTable[] {
    return this.tables.filter((table) => table.status === 'free');
  }

  protected get activeTables(): DashboardTable[] {
    return this.tables.filter((table) => table.status === 'occupied');
  }

  protected get poolTables(): DashboardTable[] {
    return this.tables.filter((table) => table.discipline === 'Pool anglais');
  }

  protected get snookerTables(): DashboardTable[] {
    return this.tables.filter((table) => table.discipline === 'Snooker');
  }

  protected get activePoolTablesCount(): number {
    return this.poolTables.filter((table) => table.status === 'occupied').length;
  }

  protected get activeSnookerTablesCount(): number {
    return this.snookerTables.filter((table) => table.status === 'occupied').length;
  }

  protected get selectedStartTable(): DashboardTable | null {
    return this.freeTables.find((table) => table.id === this.startForm.tableId) ?? null;
  }

  protected get selectedStartWaitingPlayers(): WaitingPlayerEntry[] {
    return this.selectedStartTable?.waitingPlayers ?? [];
  }

  protected get startPlayerOneOptions(): WaitingPlayerEntry[] {
    return this.selectedStartWaitingPlayers.filter(
      (entry) => !this.namesMatch(entry.playerName, this.startForm.playerTwo),
    );
  }

  protected get startPlayerTwoOptions(): WaitingPlayerEntry[] {
    return this.selectedStartWaitingPlayers.filter(
      (entry) => !this.namesMatch(entry.playerName, this.startForm.playerOne),
    );
  }

  protected get hasEnoughWaitingPlayersForStart(): boolean {
    return this.selectedStartWaitingPlayers.length >= 2;
  }

  protected get selectedFinishTable(): DashboardTable | null {
    return (
      this.activeTables.find(
        (table) => table.currentMatch?.id === this.finishForm.matchId,
      ) ?? null
    );
  }

  protected get selectedFinishMatch(): MatchRecord | null {
    return this.selectedFinishTable?.currentMatch ?? null;
  }

  protected setSection(section: DashboardSection): void {
    if (section === 'accounts' && !this.isSudo) {
      return;
    }

    this.activeSection = section;
  }

  protected async refresh(): Promise<void> {
    await this.loadDashboard(true);
  }

  protected logout(): void {
    this.authService.logout(true);
  }

  protected async addWaitingPlayer(table: DashboardTable): Promise<void> {
    const playerName = (this.waitingDrafts[table.id] ?? '').trim();

    if (!playerName) {
      this.errorMessage = 'Indique le joueur a ajouter.';
      return;
    }

    await this.runAction(async () => {
      await firstValueFrom(this.dashboardApi.addWaitingPlayer(table.id, playerName));
      this.waitingDrafts[table.id] = '';
      await this.reloadData(`${playerName} ajoute a la liste d'attente de ${table.name}.`);
    });
  }

  protected async removeWaitingPlayer(
    table: DashboardTable,
    entry: WaitingPlayerEntry,
  ): Promise<void> {
    await this.runAction(async () => {
      await firstValueFrom(
        this.dashboardApi.removeWaitingPlayer(table.id, entry.id),
      );
      await this.reloadData(
        `${entry.playerName} retire de la liste d'attente de ${table.name}.`,
      );
    });
  }

  protected async startMatch(): Promise<void> {
    const table = this.selectedStartTable;
    const waitingPlayerNames = this.selectedStartWaitingPlayers.map(
      (entry) => entry.playerName,
    );

    if (!table) {
      this.errorMessage = 'Selectionne une table libre.';
      return;
    }

    if (waitingPlayerNames.length < 2) {
      this.errorMessage =
        "Ajoute au moins deux joueurs dans la file d'attente de cette table.";
      return;
    }

    const playerOne = this.findMatchingQueuedPlayer(
      waitingPlayerNames,
      this.startForm.playerOne,
    );
    const playerTwo = this.findMatchingQueuedPlayer(
      waitingPlayerNames,
      this.startForm.playerTwo,
    );

    if (!playerOne || !playerTwo) {
      this.errorMessage =
        "Choisis deux joueurs depuis la file d'attente de la table selectionnee.";
      return;
    }

    if (this.namesMatch(playerOne, playerTwo)) {
      this.errorMessage = 'Merci de selectionner deux joueurs differents.';
      return;
    }

    await this.runAction(async () => {
      await firstValueFrom(
        this.dashboardApi.startMatch({
          tableId: this.startForm.tableId,
          playerOne,
          playerTwo,
          durationMinutes:
            table.discipline === 'Pool anglais'
              ? this.startForm.durationMinutes
              : null,
          note: this.startForm.note,
        }),
      );

      this.startForm.playerOne = '';
      this.startForm.playerTwo = '';
      this.startForm.note = '';
      await this.reloadData(`Reservation enregistree sur ${table.name}.`);
      this.activeSection = 'overview';
    });
  }

  protected async finishMatch(): Promise<void> {
    const match = this.selectedFinishMatch;
    const table = this.selectedFinishTable;

    if (!match || !table) {
      this.errorMessage = 'Choisis un match actif.';
      return;
    }

    await this.runAction(async () => {
      await firstValueFrom(
        this.dashboardApi.finishMatch(match.id, {
          winner: this.finishForm.winner,
          note: this.finishForm.note,
        }),
      );

      const winnerName = this.finishForm.winner;
      this.finishForm.note = '';
      await this.reloadData(`Victoire enregistree pour ${winnerName}.`);
      this.activeSection = 'performance';
    });
  }

  protected async createAccount(): Promise<void> {
    await this.runAction(async () => {
      await firstValueFrom(this.dashboardApi.createAccount(this.accountForm));
      this.accountForm.displayName = '';
      this.accountForm.username = '';
      this.accountForm.password = '';
      this.accountForm.role = 'admin';
      await this.reloadData('Compte cree avec succes.');
    });
  }

  protected async toggleAccountStatus(account: UserAccount): Promise<void> {
    const nextStatus = !account.isActive;
    const confirmed = window.confirm(
      nextStatus
        ? `Activer le compte ${account.displayName} ?`
        : `Desactiver le compte ${account.displayName} ?`,
    );

    if (!confirmed) {
      return;
    }

    await this.runAction(async () => {
      await firstValueFrom(
        this.dashboardApi.updateAccountStatus(account.id, nextStatus),
      );
      await this.reloadData(
        nextStatus
          ? `${account.displayName} peut maintenant se connecter.`
          : `${account.displayName} a ete desactive.`,
      );
    });
  }

  protected async deleteAccount(account: UserAccount): Promise<void> {
    const confirmed = window.confirm(
      `Supprimer definitivement le compte ${account.displayName} ?`,
    );

    if (!confirmed) {
      return;
    }

    await this.runAction(async () => {
      await firstValueFrom(this.dashboardApi.deleteAccount(account.id));
      await this.reloadData(`Compte ${account.displayName} supprime.`);
    });
  }

  protected handleStartTableChange(): void {
    if (!this.selectedStartTable || this.selectedStartTable.discipline !== 'Pool anglais') {
      this.startForm.durationMinutes = 60;
    }

    this.syncStartPlayerSelections();
    this.render();
  }

  protected handleStartPlayerSelectionChange(
    playerField: 'playerOne' | 'playerTwo',
  ): void {
    this.syncStartPlayerSelections({
      [playerField]: this.startForm[playerField],
    });
    this.render();
  }

  private async loadDashboard(isRefresh = false): Promise<void> {
    this.clearAlerts();
    this.isLoading = !isRefresh;
    this.isRefreshing = isRefresh;
    this.render();

    try {
      await firstValueFrom(
        this.authService.refreshCurrentUser().pipe(timeout(REQUEST_TIMEOUT_MS)),
      );
      await this.loadDashboardState();

      this.isLoading = false;
      this.isRefreshing = false;
      void this.refreshAccounts(false);
    } catch (error) {
      this.handleError(error);
    } finally {
      this.isLoading = false;
      this.isRefreshing = false;
      this.render();
    }
  }

  private async reloadData(successMessage = ''): Promise<void> {
    await this.loadDashboardState(successMessage);
    await this.refreshAccounts(true);
  }

  private async loadDashboardState(successMessage = ''): Promise<void> {
    const dashboardState = await firstValueFrom(
      this.dashboardApi.getDashboardState().pipe(timeout(REQUEST_TIMEOUT_MS)),
    );
    this.dashboardState = dashboardState;
    this.syncForms();

    if (successMessage) {
      this.successMessage = successMessage;
    }

    this.render();
  }

  private async refreshAccounts(throwOnError: boolean): Promise<void> {
    if (!this.isSudo) {
      this.accounts = [];
      if (this.activeSection === 'accounts') {
        this.activeSection = 'overview';
      }
      return;
    }

    try {
      const accountsResponse = await firstValueFrom(
        this.dashboardApi.getAccounts().pipe(timeout(REQUEST_TIMEOUT_MS)),
      );
      this.accounts = accountsResponse.accounts;
    } catch (error) {
      this.accounts = [];

      if (this.activeSection === 'accounts') {
        this.activeSection = 'overview';
      }

      if (throwOnError) {
        throw error;
      }

      this.errorMessage =
        "Le dashboard est charge, mais la liste des comptes n'a pas repondu.";
    }

    this.render();
  }

  private syncForms(): void {
    const nextFreeTable = this.freeTables[0] ?? null;

    if (!this.freeTables.some((table) => table.id === this.startForm.tableId)) {
      this.startForm.tableId = nextFreeTable?.id ?? '';
    }

    if (!this.selectedStartTable || this.selectedStartTable.discipline !== 'Pool anglais') {
      this.startForm.durationMinutes = 60;
    }

    this.syncStartPlayerSelections();

    const nextActiveMatchId = this.activeTables[0]?.currentMatch?.id ?? '';

    if (
      !this.activeTables.some(
        (table) => table.currentMatch?.id === this.finishForm.matchId,
      )
    ) {
      this.finishForm.matchId = nextActiveMatchId;
    }

    const selectedMatch = this.selectedFinishMatch;

    if (!selectedMatch) {
      this.finishForm.winner = '';
      return;
    }

    if (
      this.finishForm.winner !== selectedMatch.playerOne
      && this.finishForm.winner !== selectedMatch.playerTwo
    ) {
      this.finishForm.winner = selectedMatch.playerOne;
    }
  }

  private syncStartPlayerSelections(
    preferredSelection: Partial<Pick<typeof this.startForm, 'playerOne' | 'playerTwo'>> = {},
  ): void {
    const queuedPlayers = this.selectedStartWaitingPlayers.map(
      (entry) => entry.playerName,
    );

    if (!queuedPlayers.length) {
      this.startForm.playerOne = '';
      this.startForm.playerTwo = '';
      return;
    }

    const nextPlayerOne =
      this.findMatchingQueuedPlayer(
        queuedPlayers,
        preferredSelection.playerOne ?? this.startForm.playerOne,
      ) || queuedPlayers[0] || '';

    const remainingPlayers = queuedPlayers.filter(
      (playerName) => !this.namesMatch(playerName, nextPlayerOne),
    );

    const nextPlayerTwo =
      this.findMatchingQueuedPlayer(
        remainingPlayers,
        preferredSelection.playerTwo ?? this.startForm.playerTwo,
      ) || remainingPlayers[0] || '';

    this.startForm.playerOne = nextPlayerOne;
    this.startForm.playerTwo = nextPlayerTwo;
  }

  private findMatchingQueuedPlayer(players: string[], candidate: string): string {
    return players.find((playerName) => this.namesMatch(playerName, candidate)) ?? '';
  }

  private namesMatch(left: string, right: string): boolean {
    return this.normalizePlayerName(left) === this.normalizePlayerName(right);
  }

  private normalizePlayerName(value: string): string {
    return String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  private async runAction(action: () => Promise<void>): Promise<void> {
    this.clearAlerts();

    try {
      await action();
    } catch (error) {
      this.handleError(error);
    }
  }

  private clearAlerts(): void {
    this.errorMessage = '';
    this.successMessage = '';
  }

  private handleError(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 401) {
      this.authService.logout(false);
      void this.router.navigate(['/login']);
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
    return "Le serveur met trop de temps a repondre. Clique sur 'Actualiser les donnees' ou relance l'application.";
  }

  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return "Impossible de joindre le serveur. Lance l'application avec start-app.cmd puis recharge la page.";
    }

    return error.error?.message || error.message || 'Action impossible pour le moment.';
  }

  return 'Action impossible pour le moment.';
}
