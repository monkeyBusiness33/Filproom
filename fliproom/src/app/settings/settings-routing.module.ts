import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';


const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./account/account.module').then( m => m.AccountPageModule)
  },
  {
    path: 'account',
    loadChildren: () => import('./account/account.module').then( m => m.AccountPageModule)
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SettingsPageRoutingModule {}
