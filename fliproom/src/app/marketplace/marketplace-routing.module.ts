import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { MarketPlacePage } from './marketplace.page';
import {InventoryViewComponent} from "../inventory/inventory-view/inventory-view.component";

const routes: Routes = [
  {
    path: '',
    component: MarketPlacePage
  },
  {
    path: 'detail/:marketplaceListingID',
    loadChildren: () => import('./marketplace-detail/marketplace-detail.module').then(m => m.MarketPlaceDetailPageModule)
  },
  {
    path: 'steals',
    loadChildren: () => import('./steals/steals.module').then(m => m.StealsPageModule)
  },
  {
    path: 'listings',
    loadChildren: () => import('./marketplace-listings/marketplace-listings.module').then( m => m.MarketplaceListingsPageModule)
  },
  {
    path: 'offers',
    loadChildren: () => import('./offers/offers.module').then(m => m.OffersPageModule)
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MarketPlacePageRoutingModule {}
