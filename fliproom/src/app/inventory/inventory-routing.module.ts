import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { InventoryPage } from './inventory.page';
import {InventoryViewComponent} from "./inventory-view/inventory-view.component";

const routes: Routes = [
  {
    path: '',
    component: InventoryPage
  },
  {
    path: 'product/:productID',
    component: InventoryViewComponent
  },
  {
    path: 'product/:productID/variants/:variantID',
    component: InventoryViewComponent
  },
  {
    path: 'bulk/create/product/:productID',
    loadChildren: () => import('./inventory-bulk/inventory-bulk.module').then( m => m.InventoryBulkPageModule)
  },
  {
    path: 'bulk/edit/product/:productID',
    loadChildren: () => import('./inventory-bulk/inventory-bulk.module').then( m => m.InventoryBulkPageModule)
  },

];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class InventoryPageRoutingModule {}
