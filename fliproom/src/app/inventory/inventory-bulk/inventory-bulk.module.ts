import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { InventoryBulkPageRoutingModule } from './inventory-bulk-routing.module';

import { InventoryBulkPage } from './inventory-bulk.page';
import {InventoryRecordFormComponent} from "../components/inventory-record-form/inventory-record-form.component";
import {MaterialModule} from "../../material.module";

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    InventoryBulkPageRoutingModule,
    MaterialModule
  ],
    declarations: []
})
export class InventoryBulkPageModule {}
