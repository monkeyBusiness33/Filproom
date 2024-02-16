import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { MarketplaceListingsPage } from './marketplace-listings.page';

const routes: Routes = [
  {
    path: '',
    component: MarketplaceListingsPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MarketplaceListingsPageRoutingModule {}
