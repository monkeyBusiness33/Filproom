import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { OrderDetailPageRoutingModule } from './order-detail-routing.module';

import { OrderDetailPage } from './order-detail.page';
import { MaterialModule } from 'src/app/material.module';
import { ModalModule } from 'src/app/shared/modal/modal.module';
import { TableWrapperModule } from 'src/app/shared/table-wrapper/table-wrapper.module';
import { CommonComponentsModule } from '../../shared/components/components.module';
import { FliproomListModule } from 'src/app/shared/fliproom-list/fliproom-list.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    MaterialModule,
    ModalModule,
    TableWrapperModule,
    CommonComponentsModule,
    OrderDetailPageRoutingModule,
    FliproomListModule
  ],
  declarations: [
    OrderDetailPage
]
})
export class OrderDetailPageModule {}
