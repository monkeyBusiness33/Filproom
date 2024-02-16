import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { StockTakePage } from './stock-take.page';

const routes: Routes = [
  {
    path: '',
    component: StockTakePage
  },
  {
    path: ':jobID/job-line-items',
    loadChildren: () => import('./job-line-items/job-line-items.module').then( m => m.JobLineItemsPageModule)
  },
  {
    path: 'create',
    loadChildren: () => import('./create/create.module').then( m => m.CreatePageModule)
  },
  {
    path: ':jobID',
    loadChildren: () => import('./stock-take-detail/stock-take-detail.module').then( m => m.StockTakeDetailPageModule)
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class StockTakePageRoutingModule {}
