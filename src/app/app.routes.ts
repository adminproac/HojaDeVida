import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: 'dashboard', loadComponent: () => import('./pages/dashboard.component').then((m) => m.DashboardComponent) },
  { path: 'people', loadComponent: () => import('./pages/people-list.component').then((m) => m.PeopleListComponent) },
  { path: 'people/new', loadComponent: () => import('./pages/profile-form.component').then((m) => m.ProfileFormComponent) },
  { path: 'people/:id', loadComponent: () => import('./pages/person-view.component').then((m) => m.PersonViewComponent) },
  { path: 'people/:id/print', loadComponent: () => import('./pages/resume-print.component').then((m) => m.ResumePrintComponent) },
  { path: 'people/:id/edit', loadComponent: () => import('./pages/profile-form.component').then((m) => m.ProfileFormComponent) },
  { path: 'people/:id/:section/new', loadComponent: () => import('./pages/item-form.component').then((m) => m.ItemFormComponent) },
  { path: 'people/:id/:section/:itemId', loadComponent: () => import('./pages/item-form.component').then((m) => m.ItemFormComponent) },
  { path: 'schema', loadComponent: () => import('./pages/schema-view.component').then((m) => m.SchemaViewComponent) },
  { path: 'import', loadComponent: () => import('./pages/pdf-import.component').then((m) => m.PdfImportComponent) },
  { path: 'users', loadComponent: () => import('./pages/users.component').then((m) => m.UsersComponent) },
  { path: '**', redirectTo: 'dashboard' },
];
