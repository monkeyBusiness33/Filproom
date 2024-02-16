import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { OutboundPage } from './outbound.page';

const routes: Routes = [
  {
    path: '',
    component: OutboundPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class OutboundPageRoutingModule {}
