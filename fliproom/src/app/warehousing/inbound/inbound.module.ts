import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { InboundPageRoutingModule } from './inbound-routing.module';

import { InboundPage } from './inbound.page';
import { MaterialModule } from 'src/app/material.module';
import { FliproomListModule } from 'src/app/shared/fliproom-list/fliproom-list.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    InboundPageRoutingModule,
    FliproomListModule,
    MaterialModule

  ],
  declarations: [InboundPage]
})
export class InboundPageModule {}
