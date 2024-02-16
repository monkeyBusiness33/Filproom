import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { SaleChannelsPage } from './sale-channels.page';

const routes: Routes = [
  {
    path: '',
    component: SaleChannelsPage
  },
  {
    path: ':saleChannelID/consignors',
    loadChildren: () => import('./consignors/consignors.module').then( m => m.ConsignorsPageModule)
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SaleChannelsPageRoutingModule {}
