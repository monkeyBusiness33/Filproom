import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { StealsPage } from './steals.page';

const routes: Routes = [
  {
    path: '',
    component: StealsPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class StealsPageRoutingModule {}
