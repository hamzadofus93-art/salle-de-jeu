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
import { UserReservationsPageComponent } from '../reservations/user-reservations-page.component';

const REQUEST_TIMEOUT_MS = 8000;
type DashboardModal =
  | 'add-player'
  | 'start-match'
  | 'finish-match'
  | 'queues'
  | 'history'
  | 'admin'
  | null;

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [CommonModule, FormsModule, UserReservationsPageComponent],
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
  protected isLoading = true;
  protected isRefreshing = false;
  protected activeModal: DashboardModal = null;
  protected isAddPlayerTableMenuOpen = false;
  protected isStartTableMenuOpen = false;
  protected lockedAddPlayerTableId = '';
  protected lockedStartTableId = '';
  protected lockedFinishMatchId = '';
  protected errorMessage = '';
  protected successMessage = '';
  protected readonly addPlayerForm = {
    tableId: '',
    playerName: '',
  };
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

  protected get isRegularUser(): boolean {
    return this.authService.user()?.role === 'user';
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

  protected get leaderboard() {
    return this.dashboardState?.leaderboard ?? [];
  }

  protected get history() {
    return this.dashboardState?.history ?? [];
  }

  protected get totalWaitingPlayers(): number {
    return this.tables.reduce(
      (total, table) => total + table.waitingPlayers.length,
      0,
    );
  }

  protected get tablesReadyToStart(): DashboardTable[] {
    return this.freeTables.filter((table) => table.waitingPlayers.length >= 2);
  }

  protected get queueTables(): DashboardTable[] {
    return [...this.tables].sort((left, right) => {
      const waitingDifference =
        right.waitingPlayers.length - left.waitingPlayers.length;

      if (waitingDifference !== 0) {
        return waitingDifference;
      }

      return left.name.localeCompare(right.name, 'fr');
    });
  }

  protected get selectedAddPlayerTable(): DashboardTable | null {
    return this.tables.find((table) => table.id === this.addPlayerForm.tableId) ?? null;
  }

  protected get addPlayerActionLabel(): string {
    return this.selectedAddPlayerTable
      ? `Ajouter sur ${this.selectedAddPlayerTable.name}`
      : 'Ajouter';
  }

  protected get addPlayerFieldLabel(): string {
    return this.selectedAddPlayerTable
      ? `Nom du joueur pour ${this.selectedAddPlayerTable.name}`
      : 'Nom du joueur';
  }

  protected get addPlayerFieldPlaceholder(): string {
    return this.selectedAddPlayerTable
      ? `Exemple : prochain joueur pour ${this.selectedAddPlayerTable.name}`
      : 'Nom du joueur';
  }

  protected get addPlayerTableSummary(): string {
    if (!this.selectedAddPlayerTable) {
      return 'Choisir une table';
    }

    return `${this.selectedAddPlayerTable.discipline} - ${this.waitingLabel(this.selectedAddPlayerTable)}`;
  }

  protected get addPlayerWaitingNames(): string[] {
    return this.selectedAddPlayerTable?.waitingPlayers.map(
      (entry) => entry.playerName,
    ) ?? [];
  }

  protected get canStartSelectedAddPlayerTable(): boolean {
    return !!this.selectedAddPlayerTable
      && this.selectedAddPlayerTable.status === 'free'
      && this.selectedAddPlayerTable.waitingPlayers.length >= 2;
  }

  protected get activeAccountCount(): number {
    return this.accounts.filter((account) => account.isActive).length;
  }

  protected get inactiveAccountCount(): number {
    return this.accounts.filter((account) => !account.isActive).length;
  }

  protected get sudoAccountCount(): number {
    return this.accounts.filter((account) => account.role === 'sudo').length;
  }

  protected get selectedStartTable(): DashboardTable | null {
    return this.tablesReadyToStart.find((table) => table.id === this.startForm.tableId) ?? null;
  }

  protected get selectedStartWaitingPlayers(): WaitingPlayerEntry[] {
    return this.selectedStartTable?.waitingPlayers ?? [];
  }

  protected get startTableSummary(): string {
    if (!this.selectedStartTable) {
      return 'Choisir une table prete';
    }

    return `${this.selectedStartTable.discipline} - ${this.waitingLabel(this.selectedStartTable)}`;
  }

  protected get startTableWaitingNames(): string[] {
    return this.selectedStartWaitingPlayers.map(
      (entry) => entry.playerName,
    );
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

  protected get canSubmitStartMatch(): boolean {
    if (
      !this.selectedStartTable
      || !this.startForm.playerOne
      || !this.startForm.playerTwo
      || !this.hasEnoughWaitingPlayersForStart
    ) {
      return false;
    }

    if (this.namesMatch(this.startForm.playerOne, this.startForm.playerTwo)) {
      return false;
    }

    return this.selectedStartTable.discipline !== 'Pool anglais'
      || Number(this.startForm.durationMinutes) >= 15;
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

  protected get canSubmitFinishMatch(): boolean {
    return !!this.selectedFinishMatch && !!this.finishForm.winner;
  }

  protected get mainActionLabel(): string {
    if (this.tablesReadyToStart.length) {
      return 'Demarrer une partie';
    }

    if (this.activeTables.length) {
      return 'Terminer une partie';
    }

    return 'Ajouter un joueur';
  }

  protected roleLabel(role: UserRole | null | undefined): string {
    if (role === 'user') {
      return 'Utilisateur';
    }

    return role === 'sudo' ? 'Super admin' : 'Gestionnaire';
  }

  protected accountStatusLabel(account: UserAccount): string {
    return account.isActive ? 'Actif' : 'Inactif';
  }

  protected tableStatusLabel(table: DashboardTable): string {
    if (table.status === 'occupied') {
      return 'En cours';
    }

    if (table.waitingPlayers.length >= 2) {
      return 'Prete';
    }

    return 'Libre';
  }

  protected tableStatusClass(table: DashboardTable): string {
    if (table.status === 'occupied') {
      return 'badge-danger';
    }

    if (table.waitingPlayers.length >= 2) {
      return 'badge-warning';
    }

    return 'badge-success';
  }

  protected waitingLabel(table: DashboardTable): string {
    if (!table.waitingPlayers.length) {
      return 'Aucun joueur';
    }

    if (table.waitingPlayers.length === 1) {
      return '1 joueur en attente';
    }

    return `${table.waitingPlayers.length} joueurs en attente`;
  }

  protected formatMatchDuration(match: MatchRecord | null | undefined): string {
    return match?.durationMinutes ? `${match.durationMinutes} min` : 'Libre';
  }

  protected closeModal(): void {
    this.activeModal = null;
    this.isAddPlayerTableMenuOpen = false;
    this.isStartTableMenuOpen = false;
    this.lockedAddPlayerTableId = '';
    this.lockedStartTableId = '';
    this.lockedFinishMatchId = '';
    this.render();
  }

  protected openMainAction(): void {
    if (this.tablesReadyToStart.length) {
      this.openStartMatchModal();
      return;
    }

    if (this.activeTables.length) {
      this.openFinishMatchModal();
      return;
    }

    this.openAddPlayerModal();
  }

  protected openHistoryModal(): void {
    this.isAddPlayerTableMenuOpen = false;
    this.isStartTableMenuOpen = false;
    this.lockedAddPlayerTableId = '';
    this.lockedStartTableId = '';
    this.lockedFinishMatchId = '';
    this.activeModal = 'history';
    this.render();
  }

  protected openQueuesModal(): void {
    this.isAddPlayerTableMenuOpen = false;
    this.isStartTableMenuOpen = false;
    this.lockedAddPlayerTableId = '';
    this.lockedStartTableId = '';
    this.lockedFinishMatchId = '';
    this.activeModal = 'queues';
    this.render();
  }

  protected openAdminModal(): void {
    if (!this.isSudo) {
      return;
    }

    this.isAddPlayerTableMenuOpen = false;
    this.isStartTableMenuOpen = false;
    this.lockedAddPlayerTableId = '';
    this.lockedStartTableId = '';
    this.lockedFinishMatchId = '';
    this.activeModal = 'admin';
    this.render();
  }

  protected openAddPlayerModal(table?: DashboardTable): void {
    const preferredTable = table ?? this.selectedAddPlayerTable ?? this.tables[0] ?? null;
    this.isAddPlayerTableMenuOpen = false;
    this.isStartTableMenuOpen = false;
    this.lockedAddPlayerTableId = table?.id ?? '';
    this.lockedStartTableId = '';
    this.lockedFinishMatchId = '';
    this.addPlayerForm.tableId = preferredTable?.id ?? '';
    this.addPlayerForm.playerName = '';
    this.activeModal = 'add-player';
    this.render();
  }

  protected toggleAddPlayerTableMenu(): void {
    if (this.lockedAddPlayerTableId) {
      return;
    }

    this.isAddPlayerTableMenuOpen = !this.isAddPlayerTableMenuOpen;
    this.clearAlerts();
    this.render();
  }

  protected selectAddPlayerTable(table: DashboardTable): void {
    this.addPlayerForm.tableId = table.id;
    this.isAddPlayerTableMenuOpen = false;
    this.clearAlerts();
    this.render();
  }

  protected openStartMatchFromAddPlayer(): void {
    if (!this.canStartSelectedAddPlayerTable || !this.selectedAddPlayerTable) {
      return;
    }

    this.openStartMatchModal(this.selectedAddPlayerTable);
  }

  protected selectStartTable(table: DashboardTable): void {
    if (table.status !== 'free' || table.waitingPlayers.length < 2) {
      return;
    }

    this.startForm.tableId = table.id;
    this.isStartTableMenuOpen = false;
    this.clearAlerts();
    this.handleStartTableChange();
  }

  protected toggleStartTableMenu(): void {
    if (this.lockedStartTableId || !this.tablesReadyToStart.length) {
      return;
    }

    this.isStartTableMenuOpen = !this.isStartTableMenuOpen;
    this.clearAlerts();
    this.render();
  }

  protected selectStartPlayer(
    playerField: 'playerOne' | 'playerTwo',
    playerName: string,
  ): void {
    this.startForm[playerField] = playerName;
    this.clearAlerts();
    this.handleStartPlayerSelectionChange(playerField);
  }

  protected openStartMatchModal(table?: DashboardTable): void {
    this.isAddPlayerTableMenuOpen = false;
    this.isStartTableMenuOpen = false;
    const preferredTable =
      table && table.status === 'free' && table.waitingPlayers.length >= 2
        ? table
        : this.selectedStartTable ?? this.tablesReadyToStart[0] ?? null;

    this.lockedAddPlayerTableId = '';
    this.lockedStartTableId =
      table?.status === 'free' && table.waitingPlayers.length >= 2
        ? table.id
        : this.tablesReadyToStart.length === 1
          ? this.tablesReadyToStart[0]?.id ?? ''
          : '';
    this.lockedFinishMatchId = '';
    this.startForm.tableId = preferredTable?.id ?? '';
    this.handleStartTableChange();
    this.activeModal = 'start-match';
    this.render();
  }

  protected openFinishMatchModal(table?: DashboardTable): void {
    this.isAddPlayerTableMenuOpen = false;
    this.isStartTableMenuOpen = false;
    const selectedTable =
      table && table.currentMatch
        ? table
        : this.selectedFinishTable ?? this.activeTables[0] ?? null;
    const match = selectedTable?.currentMatch;

    this.lockedAddPlayerTableId = '';
    this.lockedStartTableId = '';
    this.lockedFinishMatchId =
      table?.currentMatch?.id
        ?? (this.activeTables.length === 1 ? this.activeTables[0]?.currentMatch?.id ?? '' : '');

    if (!match) {
      this.activeModal = 'finish-match';
      this.render();
      return;
    }

    this.finishForm.matchId = match.id;
    this.finishForm.winner = match.playerOne;
    this.activeModal = 'finish-match';
    this.render();
  }

  protected selectFinishMatch(table: DashboardTable): void {
    const match = table.currentMatch;

    if (!match) {
      return;
    }

    this.finishForm.matchId = match.id;
    this.finishForm.winner = match.playerOne;
    this.clearAlerts();
    this.render();
  }

  protected selectFinishWinner(winner: string): void {
    this.finishForm.winner = winner;
    this.clearAlerts();
    this.render();
  }

  protected async submitAddPlayer(): Promise<void> {
    const table = this.selectedAddPlayerTable;
    const playerName = this.addPlayerForm.playerName.trim();

    if (!table) {
      this.errorMessage = 'Choisis une table.';
      this.render();
      return;
    }

    if (!playerName) {
      this.errorMessage = 'Entre le nom du joueur.';
      this.render();
      return;
    }

    await this.runAction(async () => {
      await firstValueFrom(this.dashboardApi.addWaitingPlayer(table.id, playerName));
      this.addPlayerForm.playerName = '';
      await this.reloadData(`${playerName} ajoute sur ${table.name}.`);
      this.addPlayerForm.tableId = table.id;
      this.isAddPlayerTableMenuOpen = false;
      this.activeModal = 'add-player';
      this.render();
    });
  }

  protected async refresh(): Promise<void> {
    await this.loadDashboard(true);
  }

  protected logout(): void {
    this.authService.logout(true);
  }

  protected async removeWaitingPlayer(
    table: DashboardTable,
    entry: WaitingPlayerEntry,
  ): Promise<void> {
    await this.runAction(async () => {
      await firstValueFrom(
        this.dashboardApi.removeWaitingPlayer(table.id, entry.id),
      );
      await this.reloadData(`${entry.playerName} retire de ${table.name}.`);
    });
  }

  protected async startMatch(): Promise<void> {
    const table = this.selectedStartTable;
    const waitingPlayerNames = this.selectedStartWaitingPlayers.map(
      (entry) => entry.playerName,
    );

    if (!table) {
      this.errorMessage = 'Choisis une table libre.';
      this.render();
      return;
    }

    if (waitingPlayerNames.length < 2) {
      this.errorMessage = 'Il faut au moins deux joueurs sur cette table.';
      this.render();
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
      this.errorMessage = "Choisis les deux joueurs depuis la file d'attente.";
      this.render();
      return;
    }

    if (this.namesMatch(playerOne, playerTwo)) {
      this.errorMessage = 'Choisis deux joueurs differents.';
      this.render();
      return;
    }

    await this.runAction(async () => {
      await firstValueFrom(
        this.dashboardApi.startMatch({
          tableId: table.id,
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
      await this.reloadData(`Partie demarree sur ${table.name}.`);
      this.closeModal();
    });
  }

  protected async finishMatch(): Promise<void> {
    const match = this.selectedFinishMatch;
    const table = this.selectedFinishTable;

    if (!match || !table) {
      this.errorMessage = 'Choisis une partie en cours.';
      this.render();
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
      await this.reloadData(`${table.name} liberee. Gagnant: ${winnerName}.`);
      this.closeModal();
    });
  }

  protected async createAccount(): Promise<void> {
    await this.runAction(async () => {
      await firstValueFrom(this.dashboardApi.createAccount(this.accountForm));
      this.accountForm.displayName = '';
      this.accountForm.username = '';
      this.accountForm.password = '';
      this.accountForm.role = 'admin';
      await this.reloadData('Compte cree.');
    });
  }

  protected selectAccountRole(role: UserRole): void {
    this.accountForm.role = role;
    this.clearAlerts();
    this.render();
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
          ? `${account.displayName} peut se connecter.`
          : `${account.displayName} est desactive.`,
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
    if (
      !this.selectedStartTable
      || this.selectedStartTable.discipline !== 'Pool anglais'
    ) {
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

      if (this.isRegularUser) {
        this.dashboardState = null;
        this.accounts = [];
        this.isLoading = false;
        this.isRefreshing = false;
        this.render();
        return;
      }

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
      this.render();
      return;
    }

    try {
      const accountsResponse = await firstValueFrom(
        this.dashboardApi.getAccounts().pipe(timeout(REQUEST_TIMEOUT_MS)),
      );
      this.accounts = accountsResponse.accounts;
    } catch (error) {
      this.accounts = [];

      if (throwOnError) {
        throw error;
      }

      this.errorMessage = "La partie comptes n'a pas pu etre chargee.";
    }

    this.render();
  }

  private syncForms(): void {
    const nextTable = this.tables[0] ?? null;
    if (!this.tables.some((table) => table.id === this.addPlayerForm.tableId)) {
      this.addPlayerForm.tableId = nextTable?.id ?? '';
    }

    const nextReadyTable = this.tablesReadyToStart[0] ?? null;

    if (!this.tablesReadyToStart.some((table) => table.id === this.startForm.tableId)) {
      this.startForm.tableId = nextReadyTable?.id ?? '';
    }

    if (
      !this.selectedStartTable
      || this.selectedStartTable.discipline !== 'Pool anglais'
    ) {
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
    preferredSelection: Partial<
      Pick<typeof this.startForm, 'playerOne' | 'playerTwo'>
    > = {},
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
    return "Le serveur met trop de temps a repondre. Clique sur 'Rafraichir' ou relance l'application.";
  }

  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return "Impossible de joindre le serveur. Lance l'application avec start-app.cmd puis recharge la page.";
    }

    return error.error?.message || error.message || 'Action impossible pour le moment.';
  }

  return 'Action impossible pour le moment.';
}
