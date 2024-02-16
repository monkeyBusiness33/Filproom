import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { CreatePageRoutingModule } from './create-routing.module';

import { CreatePage } from './create.page';
import { TransferDetailsComponent } from './steps/transfer-details/transfer-details.component';
import { TransferHeaderComponent } from './steps/transfer-header/transfer-header.component';
import { TransferReviewComponent } from './steps/transfer-review/transfer-review.component';
import { MaterialModule } from 'src/app/material.module';
import { FliproomListModule } from 'src/app/shared/fliproom-list/fliproom-list.module';
import { TableWrapperModule } from 'src/app/shared/table-wrapper/table-wrapper.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    MaterialModule,
    CreatePageRoutingModule,
    FliproomListModule,
    TableWrapperModule
  ],
  declarations: [
    CreatePage,
    TransferHeaderComponent,
    TransferDetailsComponent,
    TransferReviewComponent,
  ]
})
export class CreatePageModule {}
