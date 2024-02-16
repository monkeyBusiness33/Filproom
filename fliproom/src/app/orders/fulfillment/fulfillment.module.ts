import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { FulfillmentPageRoutingModule } from './fulfillment-routing.module';

import { FulfillmentPage } from './fulfillment.page';
import {MaterialModule} from "../../material.module";

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        IonicModule,
        FulfillmentPageRoutingModule,
        MaterialModule
    ],
  declarations: [FulfillmentPage]
})
export class FulfillmentPageModule {}
