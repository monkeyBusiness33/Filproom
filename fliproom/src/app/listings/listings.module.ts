import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ListingsPageRoutingModule } from './listings-routing.module';

import { ListingsPage } from './listings.page';
import { MaterialModule } from '../material.module';
import { FliproomListModule } from '../shared/fliproom-list/fliproom-list.module';
import { ModalModule } from '../shared/modal/modal.module';
import { TableWrapperModule } from '../shared/table-wrapper/table-wrapper.module';
import { ListingFormComponent } from './listing-form/listing-form.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ListingsPageRoutingModule,
    TableWrapperModule,
    FliproomListModule,
    MaterialModule,
    ModalModule,
  ],
  declarations: [
    ListingsPage,
    ListingFormComponent
  ]
})
export class ListingsPageModule {}
