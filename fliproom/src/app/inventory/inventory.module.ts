import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { InventoryPageRoutingModule } from './inventory-routing.module';
import { TableWrapperModule } from 'src/app/shared/table-wrapper/table-wrapper.module';
import { MaterialModule } from 'src/app/material.module';
import { ModalModule } from 'src/app/shared/modal/modal.module';
import { CommonComponentsModule } from '../shared/components/components.module';
import { FliproomListModule } from '../shared/fliproom-list/fliproom-list.module';
import { SearchBarModule } from '../shared/search-bar/search-bar.module';
import { InventoryPage } from './inventory.page';
import {InventoryProductComponent} from "./components/inventory-product/inventory-product.component";
import {InventoryViewComponent} from "./inventory-view/inventory-view.component";
import {InventoryVariantComponent} from "./components/inventory-variant/inventory-variant.component";
import {InventoryRecordItemsComponent} from "./components/inventory-record-items/inventory-record-items.component";
import {InventoryRecordComponent} from "./components/inventory-record/inventory-record.component";
import {InventoryRecordFormComponent} from "./components/inventory-record-form/inventory-record-form.component";
import {InventoryBulkPage} from "./inventory-bulk/inventory-bulk.page";
import { InventoryFormsBulkEditComponent } from './components/inventory-forms-bulk-edit/inventory-forms-bulk-edit.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    TableWrapperModule,
    FliproomListModule,
    MaterialModule,
    ModalModule,
    CommonComponentsModule,
    InventoryPageRoutingModule,
    SearchBarModule,
  ],
    declarations: [
        InventoryPage,
        InventoryProductComponent,
        InventoryViewComponent,
        InventoryRecordItemsComponent,
        InventoryVariantComponent,
        InventoryRecordComponent,
        InventoryBulkPage,
        InventoryRecordFormComponent,
        InventoryFormsBulkEditComponent
    ]
})
export class InventoryPageModule {}
