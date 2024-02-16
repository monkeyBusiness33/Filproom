import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { FulfillmentPage } from './fulfillment.page';

const routes: Routes = [
  {
    path: '',
    component: FulfillmentPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class FulfillmentPageRoutingModule {}
