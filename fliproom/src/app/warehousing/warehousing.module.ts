import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { WarehousingPageRoutingModule } from './warehousing-routing.module';

import { WarehousingPage } from './warehousing.page';
import { MaterialModule } from '../material.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    WarehousingPageRoutingModule,
    MaterialModule
  ],
  declarations: [WarehousingPage]
})
export class WarehousingPageModule {}
