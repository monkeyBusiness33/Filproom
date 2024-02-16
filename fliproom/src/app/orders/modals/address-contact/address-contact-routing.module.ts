import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { AddressContactPage } from './address-contact.page';

const routes: Routes = [
  {
    path: '',
    component: AddressContactPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AddressContactPageRoutingModule {}
