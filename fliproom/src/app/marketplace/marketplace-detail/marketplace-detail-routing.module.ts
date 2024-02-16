import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { MarketPlaceDetailPage } from './marketplace-detail.page';

const routes: Routes = [
  {
    path: '',
    component: MarketPlaceDetailPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MarketPlaceDetailPageRoutingModule {}
