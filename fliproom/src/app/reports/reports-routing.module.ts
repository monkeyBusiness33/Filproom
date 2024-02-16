import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ReportsPage } from './reports.page';
import { ItemsFlowComponent } from './items-flow/items-flow.component';
import { InvoicesComponent } from './invoices/invoices.component';

const routes: Routes = [
  {
    path: '',
    component: ReportsPage
  },
  {
    path: 'items-flow',
    component: ItemsFlowComponent
  },
  {
    path: 'invoices',
    component: InvoicesComponent
  },
  {
    path: 'purchase-orders',
    component: InvoicesComponent
  },
  {path: '**', redirectTo: ''}
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ReportsPageRoutingModule {}
