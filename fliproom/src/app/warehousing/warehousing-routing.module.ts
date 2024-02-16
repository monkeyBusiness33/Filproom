import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { WarehousingPage } from './warehousing.page';

const routes: Routes = [
  {
    path: '',
    component: WarehousingPage
  },
  {
    path: 'stock-take',
    loadChildren: () => import('./stock-take/stock-take.module').then(m => m.StockTakePageModule)
  },
  {
    path: 'inbound',
    loadChildren: () => import('./inbound/inbound.module').then( m => m.InboundPageModule)
  },
  {
    path: 'outbound',
    loadChildren: () => import('./outbound/outbound.module').then( m => m.OutboundPageModule)
  },
  {
    path: 'item-search',
    loadChildren: () => import('./item-search/item-search.module').then( m => m.ItemSearchPageModule)
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class WarehousingPageRoutingModule {}
