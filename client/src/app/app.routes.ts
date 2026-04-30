import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'login',
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/login-page.component').then(
        (module) => module.LoginPageComponent,
      ),
  },
  {
    path: 'files-attente',
    loadComponent: () =>
      import('./features/public/public-queues-page.component').then(
        (module) => module.PublicQueuesPageComponent,
      ),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard-page.component').then(
        (module) => module.DashboardPageComponent,
      ),
  },
  {
    path: '**',
    redirectTo: 'login',
  },
];
