import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { TransfersPage } from './transfers.page';

const routes: Routes = [
  {
    path: '',
    component: TransfersPage
  },
  {
    path: 'create',
    loadChildren: () => import('./create/create.module').then( m => m.CreatePageModule)
  },
  {
    path: ':orderID',
    loadChildren: () => import('../orders/order-detail/order-detail.module').then( m => m.OrderDetailPageModule)
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class TransfersPageRoutingModule {}
