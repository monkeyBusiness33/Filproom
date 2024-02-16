import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { InventoryBulkPage } from './inventory-bulk.page';

const routes: Routes = [
  {
    path: '',
    component: InventoryBulkPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class InventoryBulkPageRoutingModule {}
