import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { StealsPageRoutingModule } from './steals-routing.module';

import { StealsPage } from './steals.page';
import {FliproomListModule} from "../../shared/fliproom-list/fliproom-list.module";
import {MaterialModule} from "../../material.module";

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        IonicModule,
        StealsPageRoutingModule,
        FliproomListModule,
        MaterialModule
    ],
  declarations: []
})
export class StealsPageModule {}
