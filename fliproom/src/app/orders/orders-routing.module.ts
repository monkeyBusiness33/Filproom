import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { OrdersPage } from './orders.page';

const routes: Routes = [
  {
    path: '',
    component: OrdersPage
  },
  {
    path: ':orderID',
    loadChildren: () => import('./order-detail/order-detail.module').then( m => m.OrderDetailPageModule)
  },
  {
    path: 'create/checkout',
    loadChildren: () => import('./create/create.module').then( m => m.CreatePageModule)
  },
  {
    path: 'address-contact',
    loadChildren: () => import('./modals/address-contact/address-contact.module').then( m => m.AddressContactPageModule)
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class OrdersPageRoutingModule {}
