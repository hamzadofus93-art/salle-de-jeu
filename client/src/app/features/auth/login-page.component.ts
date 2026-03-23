import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, DestroyRef, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.scss',
})
export class LoginPageComponent {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  readonly authService = inject(AuthService);
  private isDestroyed = false;

  protected readonly credentials = {
    username: '',
    password: '',
  };
  protected errorMessage = '';
  protected isSubmitting = false;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.isDestroyed = true;
    });
  }

  protected async submit(): Promise<void> {
    if (!this.credentials.username.trim() || !this.credentials.password.trim()) {
      this.errorMessage = 'Identifiant et mot de passe obligatoires.';
      this.render();
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';
    this.render();

    try {
      await firstValueFrom(
        this.authService.login(
          this.credentials.username,
          this.credentials.password,
        ),
      );
      await firstValueFrom(this.authService.refreshCurrentUser());
      window.location.assign('/dashboard');
    } catch (error) {
      this.errorMessage = extractHttpErrorMessage(error);
    } finally {
      this.isSubmitting = false;
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
  if (error instanceof HttpErrorResponse) {
    return error.error?.message || error.message || 'Connexion impossible.';
  }

  return 'Connexion impossible.';
}
