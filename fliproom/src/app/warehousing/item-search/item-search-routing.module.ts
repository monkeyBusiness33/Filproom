import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ItemSearchPage } from './item-search.page';

const routes: Routes = [
  {
    path: '',
    component: ItemSearchPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ItemSearchPageRoutingModule {}
