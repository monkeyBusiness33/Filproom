import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { OrderDetailPage } from './order-detail.page';

const routes: Routes = [
  {
    path: '',
    component: OrderDetailPage
  },
  {
    path: 'fulfillment/:fulfillmentID',
    loadChildren: () => import('../fulfillment/fulfillment.module').then( m => m.FulfillmentPageModule)
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class OrderDetailPageRoutingModule {}
