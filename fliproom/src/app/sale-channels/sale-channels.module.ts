import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { SaleChannelsPageRoutingModule } from './sale-channels-routing.module';

import { SaleChannelsPage } from './sale-channels.page';
import { MaterialModule } from '../material.module';
import { ConsignmentSettingsFormComponent } from './modals/consignment-settings-form/consignment-settings-form.component';
import { CKEditorModule } from '@ckeditor/ckeditor5-angular';
import { SaleChannelFormComponent } from './modals/sale-channel-form/sale-channel-form.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SaleChannelsPageRoutingModule,
    MaterialModule,
    CKEditorModule
  ],
  declarations: [
    SaleChannelsPage,
    ConsignmentSettingsFormComponent,
    SaleChannelFormComponent,
  ]
})
export class SaleChannelsPageModule {}
