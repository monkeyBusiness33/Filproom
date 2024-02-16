import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { TransfersPageRoutingModule } from './transfers-routing.module';

import { TransfersPage } from './transfers.page';
import { MaterialModule } from '../material.module';
import { TableWrapperModule } from '../shared/table-wrapper/table-wrapper.module';
import { FliproomListModule } from '../shared/fliproom-list/fliproom-list.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    TransfersPageRoutingModule,
    MaterialModule,
    TableWrapperModule,
    FliproomListModule
  ],
  declarations: [TransfersPage]
})
export class TransfersPageModule {}
