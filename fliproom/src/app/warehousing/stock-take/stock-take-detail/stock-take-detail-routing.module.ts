import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { StockTakeDetailPage } from './stock-take-detail.page';

const routes: Routes = [
  {
    path: '',
    component: StockTakeDetailPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class StockTakeDetailPageRoutingModule {}
