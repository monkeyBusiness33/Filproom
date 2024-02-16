import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { JobLineItemsPageRoutingModule } from './job-line-items-routing.module';

import { JobLineItemsPage } from './job-line-items.page';
import {FliproomListModule} from "../../../shared/fliproom-list/fliproom-list.module";
import {MaterialModule} from "../../../material.module";

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        IonicModule,
        JobLineItemsPageRoutingModule,
        FliproomListModule,
        MaterialModule
    ],
  declarations: [JobLineItemsPage]
})
export class JobLineItemsPageModule {}
