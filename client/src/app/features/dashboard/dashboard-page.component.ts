import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TimeoutError, firstValueFrom, timeout } from 'rxjs';
import {
  DashboardState,
  DashboardTable,
  HistoryDisciplineFilter,
  HistoryResponse,
  HistoryRow,
  MatchRecord,
  UserAccount,
  UserRole,
  WaitingPlayerEntry,
} from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { DashboardApiService } from '../../core/services/dashboard-api.service';
import { UserReservationsPageComponent } from '../reservations/user-reservations-page.component';

const REQUEST_TIMEOUT_MS = 8000;
const POOL_RESERVATION_ENDING_SOON_MINUTES = 5;
const POOL_RESERVATION_NOTIFICATION_CHECK_INTERVAL_MS = 30_000;
const POOL_HOURLY_PRICE_DH = 40;
const SNOOKER_GAME_PRICE_DH = 40;
type NewTableDiscipline = 'pool' | 'snooker';
type TablePickerFilter = 'all' | 'pool' | 'snooker';
type QueueModalView = 'waiting' | 'matches';
type DashboardSectionKey = 'ready' | 'active' | 'queues';
type DashboardModal =
  | 'add-table'
  | 'add-player'
  | 'start-match'
  | 'finish-match'
  | 'queues'
  | 'history'
  | 'profile'
  | 'admin'
  | null;

type PoolReservationNotification = {
  reservationId: string;
  tableId: string;
  tableName: string;
  clientName: string;
  durationMinutes: number;
  endsAt: number;
  remainingMinutes: number;
  isOverdue: boolean;
};

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
  private historyRequestSequence = 0;
  private poolReservationNotificationIntervalId: ReturnType<typeof setInterval> | null = null;
  private readonly dismissedPoolReservationNotificationIds = new Set<string>();

  protected dashboardState: DashboardState | null = null;
  protected accounts: UserAccount[] = [];
  protected isLoading = true;
  protected isRefreshing = false;
  protected isHistoryLoading = false;
  protected activeModal: DashboardModal = null;
  protected queueModalView: QueueModalView = 'waiting';
  protected isQueuesFullscreen = false;
  protected isAddPlayerTableMenuOpen = false;
  protected isStartTableMenuOpen = false;
  protected lockedAddPlayerTableId = '';
  protected lockedStartTableId = '';
  protected lockedFinishMatchId = '';
  protected historyRows: HistoryRow[] = [];
  protected historyTotal = 0;
  protected historyPaidTotalDh = 0;
  protected historyPage = 1;
  protected historyTotalPages = 1;
  protected isResetAllWaitingListsWarningVisible = false;
  protected isClearHistoryWarningVisible = false;
  protected errorMessage = '';
  protected successMessage = '';
  protected poolReservationNotification: PoolReservationNotification | null = null;
  protected readonly collapsedSections: Record<DashboardSectionKey, boolean> = {
    ready: false,
    active: false,
    queues: false,
  };
  protected readonly historyPageSize = 8;
  protected readonly historyFilters = {
    discipline: 'all' as HistoryDisciplineFilter,
    search: '',
  };
  protected readonly historyDraft = {
    search: '',
  };
  protected addPlayerTableFilter: TablePickerFilter = 'all';
  protected startTableFilter: TablePickerFilter = 'all';
  protected readonly addPlayerForm = {
    tableId: '',
    playerName: '',
  };
  protected readonly addTableForm = {
    discipline: 'pool' as NewTableDiscipline,
    tableNumber: 1 as number | null,
  };
  protected deleteTableCandidateId = '';
  protected readonly startForm = {
    tableId: '',
    clientName: '',
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
    managedTableIds: [] as string[],
  };
  protected accountPoolTableId = '';
  protected accountSnookerTableId = '';
  protected readonly profileForm = {
    displayName: '',
    username: '',
    password: '',
  };

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.isDestroyed = true;

      if (this.poolReservationNotificationIntervalId !== null) {
        clearInterval(this.poolReservationNotificationIntervalId);
      }
    });
  }

  async ngOnInit(): Promise<void> {
    this.startPoolReservationNotificationChecks();
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

  protected get profileInitials(): string {
    const source = String(
      this.user?.displayName?.trim() || this.user?.username?.trim() || 'P',
    );

    return source
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'P';
  }

  protected get summary() {
    return this.dashboardState?.summary ?? null;
  }

  protected get tables(): DashboardTable[] {
    return this.dashboardState?.tables ?? [];
  }

  protected get freeTables(): DashboardTable[] {
    return this.tables.filter(
      (table) =>
        table.status === 'free'
        && !table.currentMatch
        && !table.currentReservation,
    );
  }

  protected get activeTables(): DashboardTable[] {
    return this.tables.filter(
      (table) =>
        table.status === 'occupied'
        || !!table.currentMatch
        || !!table.currentReservation,
    );
  }

  protected get activeMatchTables(): DashboardTable[] {
    return this.tables.filter(
      (table) => !!table.currentMatch,
    );
  }

  protected get leaderboard() {
    return this.dashboardState?.leaderboard ?? [];
  }

  protected get history() {
    return this.dashboardState?.history ?? [];
  }

  protected get historyPageNumbers(): number[] {
    const maxVisiblePages = 5;
    const startPage = Math.max(1, this.historyPage - 2);
    const endPage = Math.min(
      this.historyTotalPages,
      startPage + maxVisiblePages - 1,
    );
    const normalizedStartPage = Math.max(1, endPage - maxVisiblePages + 1);

    return Array.from(
      { length: endPage - normalizedStartPage + 1 },
      (_, index) => normalizedStartPage + index,
    );
  }

  protected get historyRangeStart(): number {
    if (!this.historyTotal || !this.historyRows.length) {
      return 0;
    }

    return (this.historyPage - 1) * this.historyPageSize + 1;
  }

  protected get historyRangeEnd(): number {
    if (!this.historyTotal || !this.historyRows.length) {
      return 0;
    }

    return this.historyRangeStart + this.historyRows.length - 1;
  }

  protected get hasHistoryFilters(): boolean {
    return this.historyFilters.discipline !== 'all' || !!this.historyFilters.search;
  }

  protected get historyEmptyMessage(): string {
    if (this.hasHistoryFilters) {
      return 'Aucune partie ne correspond a ce filtre.';
    }

    return 'Pas encore de parties terminees.';
  }

  protected get historyArchiveCount(): number {
    return this.summary?.archiveCount ?? this.dashboardState?.historyTotal ?? this.historyTotal;
  }

  protected get historyPaidTotalLabel(): string {
    return this.formatDh(this.historyPaidTotalDh);
  }

  protected get totalWaitingPlayers(): number {
    return this.tables.reduce(
      (total, table) => total + table.waitingPlayers.length,
      0,
    );
  }

  protected get queuedTablesCount(): number {
    return this.tables.filter((table) => table.waitingPlayers.length > 0).length;
  }

  protected get tablesReadyToStart(): DashboardTable[] {
    return this.freeTables.filter(
      (table) => this.isPoolTable(table) || table.waitingPlayers.length >= 2,
    );
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

  protected get selectedAddPlayerTable(): DashboardTable | null {
    return this.tables.find((table) => table.id === this.addPlayerForm.tableId) ?? null;
  }

  protected get filteredAddPlayerTables(): DashboardTable[] {
    return this.filterTablesByDiscipline(this.tables, this.addPlayerTableFilter);
  }

  protected get normalizedAddTableNumber(): number {
    const parsedNumber = Number(this.addTableForm.tableNumber);

    if (!Number.isInteger(parsedNumber) || parsedNumber < 1) {
      return 0;
    }

    return parsedNumber;
  }

  protected get addTableDisciplineLabel(): string {
    return this.addTableForm.discipline === 'pool' ? 'Pool anglais' : 'Snooker';
  }

  protected get addTableId(): string {
    const tableNumber = this.normalizedAddTableNumber || '...';

    return `${this.addTableForm.discipline}-${tableNumber}`;
  }

  protected get addTablePreviewName(): string {
    const numberLabel = this.normalizedAddTableNumber || '...';
    const prefix = this.addTableForm.discipline === 'pool' ? 'Pool' : 'Snooker';

    return `Phoenix ${prefix} ${numberLabel}`;
  }

  protected get addTableAlreadyExists(): boolean {
    if (!this.normalizedAddTableNumber) {
      return false;
    }

    return this.tables.some((table) => table.id === this.addTableId);
  }

  protected get canSubmitAddTable(): boolean {
    return this.normalizedAddTableNumber > 0 && !this.addTableAlreadyExists;
  }

  protected get deleteTableCandidate(): DashboardTable | null {
    return this.tables.find((table) => table.id === this.deleteTableCandidateId) ?? null;
  }

  protected canDeleteTable(table: DashboardTable): boolean {
    return (
      table.status === 'free'
      && !table.currentMatch
      && !table.currentReservation
      && !table.waitingPlayers.length
      && table.sessionsCompleted === 0
    );
  }

  protected deleteTableStatusText(table: DashboardTable): string {
    if (table.currentReservation) {
      return 'Réservation en cours, suppression bloquée.';
    }

    if (table.status === 'occupied' || table.currentMatch) {
      return 'Partie en cours, suppression bloquée.';
    }

    if (table.waitingPlayers.length) {
      return `${table.waitingPlayers.length} joueur(s) en attente, vide la file d'abord.`;
    }

    if (table.sessionsCompleted > 0) {
      return 'Historique existant, suppression bloquée.';
    }

    return 'Table libre et vide, suppression possible.';
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
      && (
        this.isPoolTable(this.selectedAddPlayerTable)
        || this.selectedAddPlayerTable.waitingPlayers.length >= 2
      );
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

  protected get canSubmitCreateAccount(): boolean {
    return this.accountForm.role !== 'admin' || this.accountForm.managedTableIds.length > 0;
  }

  protected get accountPoolTables(): DashboardTable[] {
    return this.tables.filter((table) => this.matchesTableDiscipline(table, 'pool'));
  }

  protected get accountSnookerTables(): DashboardTable[] {
    return this.tables.filter((table) => this.matchesTableDiscipline(table, 'snooker'));
  }

  protected get selectedAccountTables(): DashboardTable[] {
    return this.tables.filter((table) => this.isAccountTableSelected(table.id));
  }

  protected get selectedStartTable(): DashboardTable | null {
    return this.tablesReadyToStart.find((table) => table.id === this.startForm.tableId) ?? null;
  }

  protected get filteredStartTables(): DashboardTable[] {
    return this.filterTablesByDiscipline(this.tablesReadyToStart, this.startTableFilter);
  }

  protected get selectedStartWaitingPlayers(): WaitingPlayerEntry[] {
    return this.selectedStartTable?.waitingPlayers ?? [];
  }

  protected get isSelectedStartTablePool(): boolean {
    return !!this.selectedStartTable && this.isPoolTable(this.selectedStartTable);
  }

  protected get startTableSummary(): string {
    if (!this.selectedStartTable) {
      return 'Choisir une table prete';
    }

    if (this.isPoolTable(this.selectedStartTable)) {
      return `${this.selectedStartTable.discipline} - reservation par duree`;
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
    if (this.isSelectedStartTablePool) {
      return true;
    }

    return this.selectedStartWaitingPlayers.length >= 2;
  }

  protected get canSubmitStartMatch(): boolean {
    if (this.isSelectedStartTablePool) {
      return !!this.selectedStartTable
        && !!this.startForm.clientName.trim()
        && Number(this.startForm.durationMinutes) >= 1;
    }

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
      this.activeMatchTables.find(
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

  protected get canReplaySelectedFinishMatch(): boolean {
    return !!this.selectedFinishMatch && this.selectedFinishTable?.waitingPlayers.length === 0;
  }

  protected get poolReservationAmountDue(): number {
    return this.calculatePoolAmountDue(this.startForm.durationMinutes);
  }

  protected get startAmountLabel(): string {
    if (this.isSelectedStartTablePool) {
      return this.formatDh(this.poolReservationAmountDue);
    }

    return this.formatDh(SNOOKER_GAME_PRICE_DH);
  }

  protected get startSubmitLabel(): string {
    return this.isSelectedStartTablePool ? 'Réserver la table' : 'Démarrer la partie';
  }

  protected get startModalTitle(): string {
    return this.isSelectedStartTablePool ? 'Réserver une table Pool' : 'Démarrer une partie';
  }

  protected get mainActionLabel(): string {
    if (this.tablesReadyToStart.length) {
      return 'Réserver / démarrer';
    }

    if (this.activeMatchTables.length) {
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

  protected accountManagedTablesLabel(account: UserAccount): string {
    if (account.role === 'sudo') {
      return 'Toutes les tables';
    }

    if (account.role === 'user') {
      return 'Espace réservation';
    }

    if (!account.managedTables?.length) {
      return 'Aucune table assignée';
    }

    return account.managedTables.map((table) => table.name).join(', ');
  }

  protected isAccountTableSelected(tableId: string): boolean {
    return this.accountForm.managedTableIds.includes(tableId);
  }

  protected isAccountTableAssignedToOther(tableId: string): boolean {
    return !!this.accountTableAssignedManager(tableId);
  }

  protected accountTableOptionLabel(table: DashboardTable): string {
    const manager = this.accountTableAssignedManager(table.id);

    return manager ? `${table.name} - déjà attribuée à ${manager.displayName}` : table.name;
  }

  protected isManagedAccountTableSelected(account: UserAccount, tableId: string): boolean {
    return account.managedTableIds.includes(tableId);
  }

  protected isManagedAccountTableAssignedToOther(
    account: UserAccount,
    tableId: string,
  ): boolean {
    return !!this.accountTableAssignedManager(tableId, account.id);
  }

  protected managedAccountTableTitle(account: UserAccount, table: DashboardTable): string {
    const manager = this.accountTableAssignedManager(table.id, account.id);

    if (!manager) {
      return table.name;
    }

    return `${table.name} est déjà attribuée à ${manager.displayName}`;
  }

  protected tableStatusLabel(table: DashboardTable): string {
    if (table.currentReservation) {
      return 'Réservée';
    }

    if (table.status === 'occupied') {
      return 'En cours';
    }

    if (table.waitingPlayers.length >= 2) {
      return 'Prete';
    }

    return 'Libre';
  }

  protected tableActivityLabel(table: DashboardTable): string {
    if (table.currentReservation) {
      return `${table.currentReservation.clientName || 'Client'} - fin ${this.formatTime(table.currentReservation.endAt)}`;
    }

    if (table.currentMatch) {
      return `${table.currentMatch.playerOne} contre ${table.currentMatch.playerTwo}`;
    }

    return table.waitingPlayers.length ? this.waitingLabel(table) : '--:--';
  }

  protected tableAmountLabel(table: DashboardTable): string {
    if (table.currentReservation?.amountDueDh !== null && table.currentReservation?.amountDueDh !== undefined) {
      return this.formatDh(table.currentReservation.amountDueDh);
    }

    if (table.currentMatch?.amountDueDh !== null && table.currentMatch?.amountDueDh !== undefined) {
      return this.formatDh(table.currentMatch.amountDueDh);
    }

    if (this.isPoolTable(table)) {
      return '40 DH / heure';
    }

    return '40 DH / partie';
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

  protected isDashboardSectionCollapsed(section: DashboardSectionKey): boolean {
    return this.collapsedSections[section];
  }

  protected toggleDashboardSection(section: DashboardSectionKey): void {
    this.collapsedSections[section] = !this.collapsedSections[section];
    this.render();
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

  protected nextWaitingPlayerName(table: DashboardTable): string {
    return table.waitingPlayers[0]?.playerName || '';
  }

  protected estimatedNextMatchStart(table: DashboardTable): number | null {
    if (
      !this.isPoolTable(table)
      || !table.waitingPlayers.length
    ) {
      return null;
    }

    if (table.currentReservation) {
      const reservationEndAt = new Date(table.currentReservation.endAt).getTime();

      return Number.isFinite(reservationEndAt) ? reservationEndAt : null;
    }

    if (!table.currentMatch?.durationMinutes) {
      return null;
    }

    const startedAt = new Date(table.currentMatch.startedAt).getTime();

    if (!Number.isFinite(startedAt)) {
      return null;
    }

    return startedAt + table.currentMatch.durationMinutes * 60 * 1000;
  }

  protected get poolReservationNotificationTitle(): string {
    if (!this.poolReservationNotification) {
      return '';
    }

    return this.poolReservationNotification.isOverdue
      ? 'Temps de réservation écoulé'
      : 'Réservation Pool presque terminée';
  }

  protected get poolReservationNotificationMessage(): string {
    if (!this.poolReservationNotification) {
      return '';
    }

    if (this.poolReservationNotification.isOverdue) {
      return `Le temps prevu sur ${this.poolReservationNotification.tableName} est ecoule. La table sera liberee automatiquement par le serveur.`;
    }

    return `Il reste environ ${this.poolReservationNotification.remainingMinutes} min sur ${this.poolReservationNotification.tableName}. La reservation s'ecoule automatiquement a la fin de la duree.`;
  }

  protected setQueueModalView(view: QueueModalView): void {
    if (this.queueModalView === view) {
      return;
    }

    this.queueModalView = view;
    this.render();
  }

  protected toggleQueuesFullscreen(): void {
    if (this.activeModal !== 'queues') {
      return;
    }

    this.isQueuesFullscreen = !this.isQueuesFullscreen;
    this.render();
  }

  protected setAddPlayerTableFilter(filter: TablePickerFilter): void {
    if (this.addPlayerTableFilter === filter) {
      return;
    }

    this.addPlayerTableFilter = filter;

    if (
      this.selectedAddPlayerTable
      && !this.filteredAddPlayerTables.some((table) => table.id === this.selectedAddPlayerTable?.id)
    ) {
      this.addPlayerForm.tableId = this.filteredAddPlayerTables[0]?.id ?? '';
    }

    this.render();
  }

  protected setStartTableFilter(filter: TablePickerFilter): void {
    if (this.startTableFilter === filter) {
      return;
    }

    this.startTableFilter = filter;

    if (
      this.selectedStartTable
      && !this.filteredStartTables.some((table) => table.id === this.selectedStartTable?.id)
    ) {
      this.startForm.tableId = this.filteredStartTables[0]?.id ?? '';
      this.handleStartTableChange();
      return;
    }

    this.render();
  }

  protected formatMatchDuration(match: MatchRecord | null | undefined): string {
    return match?.durationMinutes ? `${match.durationMinutes} min` : 'Libre';
  }

  protected closeModal(): void {
    this.activeModal = null;
    this.resetQueueModalState();
    this.isAddPlayerTableMenuOpen = false;
    this.isStartTableMenuOpen = false;
    this.lockedAddPlayerTableId = '';
    this.lockedStartTableId = '';
    this.lockedFinishMatchId = '';
    this.isClearHistoryWarningVisible = false;
    this.deleteTableCandidateId = '';
    this.render();
  }

  protected openMainAction(): void {
    if (this.tablesReadyToStart.length) {
      this.openStartMatchModal();
      return;
    }

    if (this.activeMatchTables.length) {
      this.openFinishMatchModal();
      return;
    }

    this.openAddPlayerModal();
  }

  protected openHistoryModal(): void {
    this.resetQueueModalState();
    this.isAddPlayerTableMenuOpen = false;
    this.isStartTableMenuOpen = false;
    this.lockedAddPlayerTableId = '';
    this.lockedStartTableId = '';
    this.lockedFinishMatchId = '';
    this.activeModal = 'history';
    this.seedHistoryFromDashboardState();
    this.render();
    void this.loadHistory();
  }

  protected openAddTableModal(): void {
    if (!this.isSudo) {
      return;
    }

    this.resetQueueModalState();
    this.isAddPlayerTableMenuOpen = false;
    this.isStartTableMenuOpen = false;
    this.lockedAddPlayerTableId = '';
    this.lockedStartTableId = '';
    this.lockedFinishMatchId = '';
    this.deleteTableCandidateId = '';
    this.addTableForm.tableNumber = this.getNextSuggestedTableNumber(
      this.addTableForm.discipline,
    );
    this.activeModal = 'add-table';
    this.clearAlerts();
    this.render();
  }

  protected openQueuesModal(
    fullscreen = false,
    view: QueueModalView = 'waiting',
  ): void {
    this.isAddPlayerTableMenuOpen = false;
    this.isStartTableMenuOpen = false;
    this.lockedAddPlayerTableId = '';
    this.lockedStartTableId = '';
    this.lockedFinishMatchId = '';
    this.queueModalView = view;
    this.isQueuesFullscreen = fullscreen;
    this.activeModal = 'queues';
    this.render();
  }

  protected selectAddTableDiscipline(discipline: NewTableDiscipline): void {
    if (discipline !== 'pool' && discipline !== 'snooker') {
      return;
    }

    this.addTableForm.discipline = discipline;
    this.addTableForm.tableNumber = this.getNextSuggestedTableNumber(discipline);
    this.clearAlerts();
    this.render();
  }

  protected submitHistorySearch(): void {
    this.historyFilters.search = this.historyDraft.search.trim();
    this.historyPage = 1;
    void this.loadHistory();
  }

  protected clearHistorySearch(): void {
    if (!this.historyDraft.search && !this.historyFilters.search) {
      return;
    }

    this.historyDraft.search = '';
    this.historyFilters.search = '';
    this.historyPage = 1;
    void this.loadHistory();
  }

  protected setHistoryDisciplineFilter(filter: HistoryDisciplineFilter): void {
    if (this.historyFilters.discipline === filter) {
      return;
    }

    this.historyFilters.discipline = filter;
    this.historyPage = 1;
    void this.loadHistory();
  }

  protected goToHistoryPage(page: number): void {
    if (
      page < 1
      || page > this.historyTotalPages
      || page === this.historyPage
      || this.isHistoryLoading
    ) {
      return;
    }

    this.historyPage = page;
    void this.loadHistory();
  }

  protected requestClearHistory(): void {
    if (!this.isSudo || !this.historyArchiveCount) {
      return;
    }

    this.clearAlerts();
    this.isClearHistoryWarningVisible = true;
    this.render();
  }

  protected cancelClearHistory(): void {
    if (!this.isClearHistoryWarningVisible) {
      return;
    }

    this.isClearHistoryWarningVisible = false;
    this.render();
  }

  protected async confirmClearHistory(): Promise<void> {
    if (!this.isSudo) {
      return;
    }

    if (!this.historyArchiveCount) {
      this.isClearHistoryWarningVisible = false;
      this.render();
      return;
    }

    await this.runAction(async () => {
      const result = await firstValueFrom(
        this.dashboardApi.clearHistory().pipe(timeout(REQUEST_TIMEOUT_MS)),
      );
      this.isClearHistoryWarningVisible = false;
      this.historyPage = 1;
      this.historyRows = [];
      this.historyTotal = 0;
      this.historyPaidTotalDh = 0;
      this.historyTotalPages = 1;
      await this.reloadData(`${result.deletedCount} partie(s) archivee(s) supprimee(s).`);
    });
  }

  protected openAdminModal(): void {
    if (!this.isSudo) {
      return;
    }

    this.resetQueueModalState();
    this.isAddPlayerTableMenuOpen = false;
    this.isStartTableMenuOpen = false;
    this.lockedAddPlayerTableId = '';
    this.lockedStartTableId = '';
    this.lockedFinishMatchId = '';
    this.activeModal = 'admin';
    this.render();
  }

  protected openProfileModal(): void {
    this.resetQueueModalState();
    this.isAddPlayerTableMenuOpen = false;
    this.isStartTableMenuOpen = false;
    this.lockedAddPlayerTableId = '';
    this.lockedStartTableId = '';
    this.lockedFinishMatchId = '';
    this.profileForm.displayName = this.user?.displayName ?? '';
    this.profileForm.username = this.user?.username ?? '';
    this.profileForm.password = '';
    this.activeModal = 'profile';
    this.clearAlerts();
    this.render();
  }

  protected openAddPlayerModal(table?: DashboardTable): void {
    const preferredTable = table ?? this.selectedAddPlayerTable ?? this.tables[0] ?? null;
    this.resetQueueModalState();
    this.isAddPlayerTableMenuOpen = false;
    this.isStartTableMenuOpen = false;
    this.lockedAddPlayerTableId = table?.id ?? '';
    this.lockedStartTableId = '';
    this.lockedFinishMatchId = '';
    this.addPlayerTableFilter = 'all';
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
    if (
      table.status !== 'free'
      || (!this.isPoolTable(table) && table.waitingPlayers.length < 2)
    ) {
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
    this.resetQueueModalState();
    this.isAddPlayerTableMenuOpen = false;
    this.isStartTableMenuOpen = false;
    const preferredTable =
      table
      && table.status === 'free'
      && (this.isPoolTable(table) || table.waitingPlayers.length >= 2)
        ? table
        : this.selectedStartTable ?? this.tablesReadyToStart[0] ?? null;

    this.lockedAddPlayerTableId = '';
    this.lockedStartTableId =
      table?.status === 'free'
      && (this.isPoolTable(table) || table.waitingPlayers.length >= 2)
        ? table.id
        : this.tablesReadyToStart.length === 1
          ? this.tablesReadyToStart[0]?.id ?? ''
          : '';
    this.lockedFinishMatchId = '';
    this.startTableFilter = 'all';
    this.startForm.tableId = preferredTable?.id ?? '';
    this.startForm.clientName = '';
    this.startForm.note = '';
    this.handleStartTableChange();
    this.activeModal = 'start-match';
    this.render();
  }

  protected openFinishMatchModal(table?: DashboardTable): void {
    this.resetQueueModalState();
    this.isAddPlayerTableMenuOpen = false;
    this.isStartTableMenuOpen = false;
    const selectedTable =
      table && table.currentMatch
        ? table
        : this.selectedFinishTable ?? this.activeMatchTables[0] ?? null;
    const match = selectedTable?.currentMatch;

    this.lockedAddPlayerTableId = '';
    this.lockedStartTableId = '';
    this.lockedFinishMatchId =
      table?.currentMatch?.id
        ?? (this.activeMatchTables.length === 1 ? this.activeMatchTables[0]?.currentMatch?.id ?? '' : '');

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

  protected async submitAddTable(): Promise<void> {
    if (!this.isSudo) {
      this.errorMessage = "Seul le super admin peut ajouter une table.";
      this.render();
      return;
    }

    const discipline = this.addTableForm.discipline;
    const tableNumber = this.normalizedAddTableNumber;
    const tableName = this.buildTableName(discipline, tableNumber);

    if (!tableNumber) {
      this.errorMessage = 'Indique un numero de table valide.';
      this.render();
      return;
    }

    if (this.addTableAlreadyExists) {
      this.errorMessage = 'Cette table existe deja.';
      this.render();
      return;
    }

    await this.runAction(async () => {
      await firstValueFrom(
        this.dashboardApi.createTable({
          discipline,
          tableNumber,
        }),
      );

      await this.reloadData(`${tableName} ajoutee.`);
      this.addTableForm.discipline = discipline;
      this.addTableForm.tableNumber = this.getNextSuggestedTableNumber(discipline);
      this.activeModal = 'add-table';
      this.render();
    });
  }

  protected requestDeleteTable(table: DashboardTable): void {
    this.clearAlerts();

    if (!this.canDeleteTable(table)) {
      this.errorMessage = this.deleteTableStatusText(table);
      this.render();
      return;
    }

    this.deleteTableCandidateId = table.id;
    this.render();
  }

  protected cancelDeleteTable(): void {
    this.deleteTableCandidateId = '';
    this.clearAlerts();
    this.render();
  }

  protected async confirmDeleteTable(): Promise<void> {
    const table = this.deleteTableCandidate;
    const tableId = String(table?.id || '').trim();

    if (!table || !tableId) {
      this.deleteTableCandidateId = '';
      this.errorMessage = 'Table introuvable, recharge la page puis réessaie.';
      this.render();
      return;
    }

    await this.runAction(async () => {
      await firstValueFrom(
        this.dashboardApi.deleteTable(tableId).pipe(timeout(REQUEST_TIMEOUT_MS)),
      );

      this.deleteTableCandidateId = '';
      await this.reloadData(`${table.name} supprimée.`);
      this.addTableForm.tableNumber = this.getNextSuggestedTableNumber(
        this.addTableForm.discipline,
      );
      this.activeModal = 'add-table';
      this.render();
    });
  }

  protected async refresh(): Promise<void> {
    this.isResetAllWaitingListsWarningVisible = false;
    this.isClearHistoryWarningVisible = false;
    await this.loadDashboard(true);
  }

  protected dismissPoolReservationNotification(): void {
    if (!this.poolReservationNotification) {
      return;
    }

    this.dismissedPoolReservationNotificationIds.add(
      this.poolReservationNotification.reservationId,
    );
    this.syncPoolReservationNotification(true);
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

  protected requestResetAllWaitingLists(): void {
    if (!this.totalWaitingPlayers) {
      return;
    }

    this.clearAlerts();
    this.isResetAllWaitingListsWarningVisible = true;
    this.render();
  }

  protected cancelResetAllWaitingLists(): void {
    if (!this.isResetAllWaitingListsWarningVisible) {
      return;
    }

    this.isResetAllWaitingListsWarningVisible = false;
    this.render();
  }

  protected async confirmResetAllWaitingLists(): Promise<void> {
    if (!this.totalWaitingPlayers) {
      this.isResetAllWaitingListsWarningVisible = false;
      this.render();
      return;
    }

    await this.runAction(async () => {
      const result = await firstValueFrom(this.dashboardApi.resetAllWaitingLists());
      this.isResetAllWaitingListsWarningVisible = false;
      await this.reloadData(
        `${result.clearedCount} joueur(s) retires de toutes les files d attente.`,
      );
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

    if (this.isPoolTable(table)) {
      const clientName = this.startForm.clientName.trim();
      const durationMinutes = Number(this.startForm.durationMinutes);

      if (!clientName) {
        this.errorMessage = 'Indique le nom du client.';
        this.render();
        return;
      }

      if (!Number.isFinite(durationMinutes) || durationMinutes < 1) {
        this.errorMessage = 'Indique une durée valide.';
        this.render();
        return;
      }

      await this.runAction(async () => {
        await firstValueFrom(
          this.dashboardApi.createReservation({
            tableId: table.id,
            clientName,
            durationMinutes,
            note: this.startForm.note,
          }),
        );

        const amountLabel = this.formatDh(this.calculatePoolAmountDue(durationMinutes));
        this.startForm.clientName = '';
        this.startForm.note = '';
        await this.reloadData(
          `${table.name} réservée pour ${clientName}. Montant à payer : ${amountLabel}.`,
        );
        this.closeModal();
      });
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
      await this.reloadData(
        `Partie demarree sur ${table.name}. Montant à payer : ${this.formatDh(SNOOKER_GAME_PRICE_DH)}.`,
      );
      this.closeModal();
    });
  }

  protected async finishMatch(replay = false): Promise<void> {
    const match = this.selectedFinishMatch;
    const table = this.selectedFinishTable;

    if (!match || !table) {
      this.errorMessage = 'Choisis une partie en cours.';
      this.render();
      return;
    }

    if (replay && !this.canReplaySelectedFinishMatch) {
      this.errorMessage = "Rejouer est possible seulement si personne n'attend sur cette table.";
      this.render();
      return;
    }

    await this.runAction(async () => {
      await firstValueFrom(
        this.dashboardApi.finishMatch(match.id, {
          winner: this.finishForm.winner,
          note: this.finishForm.note,
          replay,
        }),
      );

      const winnerName = this.finishForm.winner;
      this.finishForm.note = '';
      await this.reloadData(
        replay
          ? `Partie terminee sur ${table.name}. Rejoue lance entre ${match.playerOne} et ${match.playerTwo}.`
          : `${table.name} liberee. Gagnant: ${winnerName}.`,
      );
      this.closeModal();
    });
  }

  protected async completePoolReservation(table: DashboardTable): Promise<void> {
    const reservation = table.currentReservation;

    if (!reservation) {
      this.errorMessage = 'Reservation introuvable, recharge la page puis réessaie.';
      this.render();
      return;
    }

    const confirmed = window.confirm(
      `Cloturer la reservation Pool sur ${table.name} pour ${reservation.clientName || 'ce client'} ?`,
    );

    if (!confirmed) {
      return;
    }

    await this.runAction(async () => {
      await firstValueFrom(
        this.dashboardApi.completeReservation(reservation.id).pipe(timeout(REQUEST_TIMEOUT_MS)),
      );
      await this.reloadData(`${table.name} liberee. Reservation Pool cloturee.`);
    });
  }

  protected async createAccount(): Promise<void> {
    await this.runAction(async () => {
      await firstValueFrom(this.dashboardApi.createAccount(this.accountForm));
      this.accountForm.displayName = '';
      this.accountForm.username = '';
      this.accountForm.password = '';
      this.accountForm.role = 'admin';
      this.accountForm.managedTableIds = [];
      this.accountPoolTableId = '';
      this.accountSnookerTableId = '';
      await this.reloadData('Compte cree.');
    });
  }

  protected async saveProfile(): Promise<void> {
    const payload = {
      displayName: this.profileForm.displayName,
      username: this.profileForm.username,
      password: this.profileForm.password.trim() || undefined,
    };

    await this.runAction(async () => {
      await firstValueFrom(
        this.authService.updateCurrentUser(payload).pipe(timeout(REQUEST_TIMEOUT_MS)),
      );
      this.profileForm.password = '';
      this.successMessage = 'Profil mis a jour.';
      this.render();
    });
  }

  protected selectAccountRole(role: UserRole): void {
    this.accountForm.role = role;
    if (role !== 'admin') {
      this.accountForm.managedTableIds = [];
      this.accountPoolTableId = '';
      this.accountSnookerTableId = '';
    }
    this.clearAlerts();
    this.render();
  }

  protected addAccountTable(tableId: string): void {
    if (this.accountForm.role !== 'admin') {
      return;
    }

    const normalizedTableId = tableId.trim();

    if (
      !normalizedTableId
      || this.isAccountTableSelected(normalizedTableId)
      || this.isAccountTableAssignedToOther(normalizedTableId)
    ) {
      return;
    }

    this.clearAlerts();
    this.accountForm.managedTableIds = [
      ...this.accountForm.managedTableIds,
      normalizedTableId,
    ];

    if (this.accountPoolTableId === normalizedTableId) {
      this.accountPoolTableId = '';
    }

    if (this.accountSnookerTableId === normalizedTableId) {
      this.accountSnookerTableId = '';
    }

    this.render();
  }

  protected addAccountTablesByDiscipline(discipline: NewTableDiscipline): void {
    if (this.accountForm.role !== 'admin') {
      return;
    }

    const tableIds = (discipline === 'pool' ? this.accountPoolTables : this.accountSnookerTables)
      .filter((table) => !this.isAccountTableAssignedToOther(table.id))
      .map((table) => table.id);

    this.clearAlerts();
    this.accountForm.managedTableIds = Array.from(
      new Set([...this.accountForm.managedTableIds, ...tableIds]),
    );
    this.accountPoolTableId = '';
    this.accountSnookerTableId = '';
    this.render();
  }

  protected removeAccountTable(tableId: string): void {
    this.clearAlerts();
    this.accountForm.managedTableIds = this.accountForm.managedTableIds.filter(
      (currentTableId) => currentTableId !== tableId,
    );
    this.render();
  }

  protected clearAccountTables(discipline?: NewTableDiscipline): void {
    this.clearAlerts();

    if (!discipline) {
      this.accountForm.managedTableIds = [];
    } else {
      this.accountForm.managedTableIds = this.accountForm.managedTableIds.filter(
        (tableId) => {
          const table = this.tables.find((entry) => entry.id === tableId);
          return !table || !this.matchesTableDiscipline(table, discipline);
        },
      );
    }

    this.accountPoolTableId = '';
    this.accountSnookerTableId = '';
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

  protected async toggleManagedAccountTable(account: UserAccount, tableId: string): Promise<void> {
    if (account.role !== 'admin') {
      return;
    }

    const isSelected = this.isManagedAccountTableSelected(account, tableId);

    if (!isSelected && this.isManagedAccountTableAssignedToOther(account, tableId)) {
      const manager = this.accountTableAssignedManager(tableId, account.id);
      this.errorMessage = manager
        ? `Cette table est deja attribuee a ${manager.displayName}.`
        : 'Cette table est deja attribuee a un autre gestionnaire.';
      this.render();
      return;
    }

    const managedTableIds = isSelected
      ? account.managedTableIds.filter((currentTableId) => currentTableId !== tableId)
      : [...account.managedTableIds, tableId];

    if (!managedTableIds.length) {
      this.errorMessage = 'Un gestionnaire doit garder au moins une table.';
      this.render();
      return;
    }

    await this.saveManagedAccountTables(account, managedTableIds);
  }

  protected async setManagedAccountTablesByDiscipline(
    account: UserAccount,
    discipline: NewTableDiscipline,
  ): Promise<void> {
    if (account.role !== 'admin') {
      return;
    }

    const tableIds = (discipline === 'pool' ? this.accountPoolTables : this.accountSnookerTables)
      .filter((table) => !this.isManagedAccountTableAssignedToOther(account, table.id))
      .map((table) => table.id);
    const managedTableIds = Array.from(new Set([...account.managedTableIds, ...tableIds]));

    await this.saveManagedAccountTables(account, managedTableIds);
  }

  protected async clearManagedAccountTablesByDiscipline(
    account: UserAccount,
    discipline: NewTableDiscipline,
  ): Promise<void> {
    if (account.role !== 'admin') {
      return;
    }

    const managedTableIds = account.managedTableIds.filter((tableId) => {
      const table = this.tables.find((entry) => entry.id === tableId);
      return !table || !this.matchesTableDiscipline(table, discipline);
    });

    if (!managedTableIds.length) {
      this.errorMessage = 'Un gestionnaire doit garder au moins une table.';
      this.render();
      return;
    }

    await this.saveManagedAccountTables(account, managedTableIds);
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

  private async saveManagedAccountTables(
    account: UserAccount,
    managedTableIds: string[],
  ): Promise<void> {
    await this.runAction(async () => {
      await firstValueFrom(
        this.dashboardApi.updateAccountManagedTables(account.id, managedTableIds),
      );
      await this.reloadData(`Tables mises a jour pour ${account.displayName}.`);
    });
  }

  private accountTableAssignedManager(
    tableId: string,
    ignoredAccountId = '',
  ): UserAccount | null {
    return this.accounts.find(
      (account) =>
        account.role === 'admin'
        && account.id !== ignoredAccountId
        && account.managedTableIds.includes(tableId),
    ) ?? null;
  }

  protected handleStartTableChange(): void {
    if (
      !this.selectedStartTable
      || !this.isPoolTable(this.selectedStartTable)
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
    this.isResetAllWaitingListsWarningVisible = false;
    this.isClearHistoryWarningVisible = false;
    this.seedHistoryFromDashboardState();
    this.syncForms();
    this.syncPoolReservationNotification(false);

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

  private seedHistoryFromDashboardState(): void {
    if (
      this.historyFilters.discipline !== 'all'
      || !!this.historyFilters.search
      || this.historyPage !== 1
      || this.historyRows.length
      || !this.dashboardState
    ) {
      return;
    }

    this.historyRows = this.dashboardState.history;
    this.historyTotal = this.dashboardState.historyTotal;
    this.historyPaidTotalDh = this.dashboardState.historyPaidTotalDh ?? 0;
    this.historyTotalPages = Math.max(
      1,
      Math.ceil(this.historyTotal / this.historyPageSize),
    );
  }

  private async loadHistory(): Promise<void> {
    const requestId = ++this.historyRequestSequence;
    this.isHistoryLoading = true;
    this.render();

    try {
      const historyResponse = await firstValueFrom(
        this.dashboardApi
          .getHistory({
            page: this.historyPage,
            pageSize: this.historyPageSize,
            discipline: this.historyFilters.discipline,
            search: this.historyFilters.search,
          })
          .pipe(timeout(REQUEST_TIMEOUT_MS)),
      );

      if (requestId !== this.historyRequestSequence) {
        return;
      }

      this.syncHistoryResponse(historyResponse);
    } catch (error) {
      if (requestId !== this.historyRequestSequence) {
        return;
      }

      this.handleError(error);
    } finally {
      if (requestId === this.historyRequestSequence) {
        this.isHistoryLoading = false;
        this.render();
      }
    }
  }

  private syncHistoryResponse(historyResponse: HistoryResponse): void {
    this.historyRows = historyResponse.rows;
    this.historyTotal = historyResponse.total;
    this.historyPaidTotalDh = historyResponse.totalPaidDh ?? 0;
    this.historyPage = historyResponse.page;
    this.historyTotalPages = historyResponse.totalPages;
  }

  private syncForms(): void {
    if (
      this.deleteTableCandidateId
      && !this.tables.some((table) => table.id === this.deleteTableCandidateId)
    ) {
      this.deleteTableCandidateId = '';
    }

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
      || !this.isPoolTable(this.selectedStartTable)
    ) {
      this.startForm.durationMinutes = 60;
    }

    this.syncStartPlayerSelections();

    const nextActiveMatchId = this.activeMatchTables[0]?.currentMatch?.id ?? '';

    if (
      !this.activeMatchTables.some(
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
    if (this.isSelectedStartTablePool) {
      this.startForm.playerOne = '';
      this.startForm.playerTwo = '';
      return;
    }

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

  private buildTableName(discipline: NewTableDiscipline, tableNumber: number): string {
    const prefix = discipline === 'pool' ? 'Pool' : 'Snooker';

    return `Phoenix ${prefix} ${tableNumber}`;
  }

  private getNextSuggestedTableNumber(discipline: NewTableDiscipline): number {
    const matchingNumbers = this.tables
      .filter((table) => this.matchesTableDiscipline(table, discipline))
      .map((table) => this.extractTrailingNumber(table.id) || this.extractTrailingNumber(table.name));

    return Math.max(0, ...matchingNumbers) + 1;
  }

  private filterTablesByDiscipline(
    tables: DashboardTable[],
    discipline: TablePickerFilter,
  ): DashboardTable[] {
    if (discipline === 'all') {
      return tables;
    }

    return tables.filter((table) => this.matchesTableDiscipline(table, discipline));
  }

  private matchesTableDiscipline(
    table: DashboardTable,
    discipline: NewTableDiscipline | TablePickerFilter,
  ): boolean {
    if (discipline === 'pool') {
      return this.isPoolTable(table);
    }

    return table.discipline === 'Snooker' || table.shortDiscipline === 'Snooker';
  }

  protected isPoolTable(table: DashboardTable): boolean {
    return table.discipline === 'Pool anglais' || table.shortDiscipline === 'Pool';
  }

  private calculatePoolAmountDue(durationMinutes: number | string | null | undefined): number {
    const duration = Number(durationMinutes);

    if (!Number.isFinite(duration) || duration <= 0) {
      return 0;
    }

    return Math.round(((duration * POOL_HOURLY_PRICE_DH) / 60) * 100) / 100;
  }

  protected formatDh(amount: number | null | undefined): string {
    const value = Number(amount);

    if (!Number.isFinite(value)) {
      return '-- DH';
    }

    const hasDecimals = Math.round(value) !== value;

    return `${value.toLocaleString('fr-FR', {
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: 2,
    })} DH`;
  }

  private formatTime(value: string | null | undefined): string {
    const date = new Date(String(value || ''));

    if (Number.isNaN(date.getTime())) {
      return '--:--';
    }

    return date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private extractTrailingNumber(value: string | null | undefined): number {
    const match = String(value || '').match(/(\d+)(?!.*\d)/);

    return match ? Number(match[1]) : 0;
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

  private resetQueueModalState(): void {
    this.queueModalView = 'waiting';
    this.isQueuesFullscreen = false;
  }

  private startPoolReservationNotificationChecks(): void {
    if (this.poolReservationNotificationIntervalId !== null) {
      return;
    }

    this.poolReservationNotificationIntervalId = setInterval(() => {
      this.syncPoolReservationNotification(true);
    }, POOL_RESERVATION_NOTIFICATION_CHECK_INTERVAL_MS);
  }

  private syncPoolReservationNotification(shouldRender: boolean): void {
    const currentNotification = this.poolReservationNotification;
    const nextNotification = this.findPoolReservationNotification();

    this.poolReservationNotification = nextNotification;

    if (
      !shouldRender
      || (
        currentNotification?.reservationId === nextNotification?.reservationId
        && currentNotification?.remainingMinutes === nextNotification?.remainingMinutes
        && currentNotification?.isOverdue === nextNotification?.isOverdue
      )
    ) {
      return;
    }

    this.render();
  }

  private findPoolReservationNotification(): PoolReservationNotification | null {
    if (!this.dashboardState || this.isRegularUser) {
      return null;
    }

    const activeReservationIds = new Set(
      this.activeTables
        .map((table) => table.currentReservation?.id ?? '')
        .filter((reservationId) => !!reservationId),
    );

    for (const dismissedReservationId of Array.from(this.dismissedPoolReservationNotificationIds)) {
      if (!activeReservationIds.has(dismissedReservationId)) {
        this.dismissedPoolReservationNotificationIds.delete(dismissedReservationId);
      }
    }

    const now = Date.now();

    return this.activeTables
      .map((table) => this.buildPoolReservationNotification(table, now))
      .filter(
        (notification): notification is PoolReservationNotification =>
          !!notification
          && !this.dismissedPoolReservationNotificationIds.has(notification.reservationId),
      )
      .sort((left, right) => {
        const leftRemaining = left.endsAt - now;
        const rightRemaining = right.endsAt - now;

        if (leftRemaining !== rightRemaining) {
          return leftRemaining - rightRemaining;
        }

        return left.tableName.localeCompare(right.tableName, 'fr', {
          numeric: true,
          sensitivity: 'base',
        });
      })[0] ?? null;
  }

  private buildPoolReservationNotification(
    table: DashboardTable,
    now: number,
  ): PoolReservationNotification | null {
    const reservation = table.currentReservation;

    if (!this.isPoolTable(table) || !reservation?.durationMinutes) {
      return null;
    }

    const endsAt = new Date(reservation.endAt).getTime();

    if (!Number.isFinite(endsAt)) {
      return null;
    }

    const remainingMs = endsAt - now;

    if (remainingMs > POOL_RESERVATION_ENDING_SOON_MINUTES * 60 * 1000) {
      return null;
    }

    return {
      reservationId: reservation.id,
      tableId: table.id,
      tableName: table.name,
      clientName: reservation.clientName || 'Client',
      durationMinutes: reservation.durationMinutes,
      endsAt,
      remainingMinutes: Math.max(0, Math.ceil(remainingMs / 60_000)),
      isOverdue: remainingMs <= 0,
    };
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
    return "Le serveur met trop de temps à répondre. Clique sur 'Rafraîchir' ou relance l'application.";
  }

  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return "Impossible de joindre le serveur. Lance l'application avec start-app.cmd puis recharge la page.";
    }

    return error.error?.message || error.message || 'Action impossible pour le moment.';
  }

  return 'Action impossible pour le moment.';
}
