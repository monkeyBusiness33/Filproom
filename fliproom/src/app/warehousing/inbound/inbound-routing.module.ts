import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { InboundPage } from './inbound.page';

const routes: Routes = [
  {
    path: '',
    component: InboundPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class InboundPageRoutingModule {}
