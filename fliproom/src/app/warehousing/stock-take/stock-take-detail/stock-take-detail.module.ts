import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';


import { StockTakeDetailPage } from './stock-take-detail.page';
import {StockTakeDetailPageRoutingModule} from "./stock-take-detail-routing.module";
import {MatButtonModule} from "@angular/material/button";
import {MatProgressBarModule} from "@angular/material/progress-bar";
import {MaterialModule} from "../../../material.module";

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    StockTakeDetailPageRoutingModule,
    MaterialModule,
    MatButtonModule,
    MatProgressBarModule
  ],
  declarations: [StockTakeDetailPage]
})
export class StockTakeDetailPageModule {}
