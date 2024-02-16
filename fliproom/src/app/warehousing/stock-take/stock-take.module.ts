import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { StockTakePageRoutingModule } from './stock-take-routing.module';

import { StockTakePage } from './stock-take.page';
import {FliproomListModule} from "../../shared/fliproom-list/fliproom-list.module";
import {MatIconModule} from "@angular/material/icon";
import {MatButtonModule} from "@angular/material/button";
import {TableWrapperModule} from "../../shared/table-wrapper/table-wrapper.module";
import {MatTableModule} from "@angular/material/table";
import {MatSortModule} from "@angular/material/sort";

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    StockTakePageRoutingModule,
    FliproomListModule,
    MatIconModule,
    MatButtonModule,
    TableWrapperModule,
    MatTableModule,
    MatSortModule
  ],
  declarations: [StockTakePage]
})
export class StockTakePageModule {
}
