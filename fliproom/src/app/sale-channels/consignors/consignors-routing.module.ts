import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ConsignorsPage } from './consignors.page';

const routes: Routes = [
  {
    path: '',
    component: ConsignorsPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ConsignorsPageRoutingModule {}
