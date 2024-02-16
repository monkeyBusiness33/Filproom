import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { JobLineItemsPage } from './job-line-items.page';

const routes: Routes = [
  {
    path: '',
    component: JobLineItemsPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class JobLineItemsPageRoutingModule {}
