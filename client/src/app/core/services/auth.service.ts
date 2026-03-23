import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, tap, throwError } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';
import { AuthMeResponse, LoginResponse, UserAccount } from '../models/api.models';

interface StoredSession {
  token: string;
  user: UserAccount;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly storageKey = 'phoenix-angular-session-v1';
  private readonly sessionSignal = signal<StoredSession | null>(this.readStoredSession());

  readonly user = computed(() => this.sessionSignal()?.user ?? null);
  readonly isAuthenticated = computed(() => Boolean(this.sessionSignal()?.token));
  readonly isSudo = computed(() => this.user()?.role === 'sudo');

  login(username: string, password: string): Observable<UserAccount> {
    return this.http
      .post<LoginResponse>(`${API_BASE_URL}/auth/login`, { username, password })
      .pipe(
        tap((response) => {
          this.persistSession({
            token: response.token,
            user: response.user,
          });
        }),
        map((response) => response.user),
      );
  }

  refreshCurrentUser(): Observable<UserAccount | null> {
    if (!this.getToken()) {
      return of(null);
    }

    return this.http.get<AuthMeResponse>(`${API_BASE_URL}/auth/me`).pipe(
      tap((response) => {
        const currentToken = this.getToken();

        if (currentToken) {
          this.persistSession({
            token: currentToken,
            user: response.user,
          });
        }
      }),
      map((response) => response.user),
      catchError((error) => {
        this.clearSession();
        return throwError(() => error);
      }),
    );
  }

  logout(redirectToLogin = true): void {
    this.clearSession();

    if (redirectToLogin) {
      window.location.assign('/login');
    }
  }

  getToken(): string | null {
    return this.sessionSignal()?.token ?? null;
  }

  private persistSession(session: StoredSession): void {
    this.sessionSignal.set(session);
    window.localStorage.setItem(this.storageKey, JSON.stringify(session));
  }

  private clearSession(): void {
    this.sessionSignal.set(null);
    window.localStorage.removeItem(this.storageKey);
  }

  private readStoredSession(): StoredSession | null {
    const rawValue = window.localStorage.getItem(this.storageKey);

    if (!rawValue) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawValue) as StoredSession;

      if (!parsed?.token || !parsed?.user) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }
}
