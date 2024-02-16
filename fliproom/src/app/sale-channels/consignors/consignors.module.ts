import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ConsignorsPageRoutingModule } from './consignors-routing.module';

import { ConsignorsPage } from './consignors.page';
import { MaterialModule } from 'src/app/material.module';
import { FliproomListModule } from 'src/app/shared/fliproom-list/fliproom-list.module';
import { ConsignorFormComponent } from '../modals/consignor-form/consignor-form.component';
import { TableWrapperModule } from 'src/app/shared/table-wrapper/table-wrapper.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ConsignorsPageRoutingModule,
    MaterialModule,
    FliproomListModule,
    TableWrapperModule
  ],
  declarations: [
    ConsignorsPage,
    ConsignorFormComponent
  ]
})
export class ConsignorsPageModule {}
