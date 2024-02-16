import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { OutboundPageRoutingModule } from './outbound-routing.module';

import { OutboundPage } from './outbound.page';
import { MaterialModule } from 'src/app/material.module';
import { FliproomListModule } from 'src/app/shared/fliproom-list/fliproom-list.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    OutboundPageRoutingModule,
    MaterialModule,
    FliproomListModule
  ],
  declarations: [OutboundPage]
})
export class OutboundPageModule {}
