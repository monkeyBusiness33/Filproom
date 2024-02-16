import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { CustomerOrderPageRoutingModule } from './customer-order-routing.module';

import { CustomerOrderPage } from './customer-order.page';
import {ItemsSummaryComponent} from "../components/items-summary/items-summary.component";
import {MaterialModule} from "../../material.module";
import {OrderSummaryComponent} from "../components/order-summary/order-summary.component";
import {CheckoutContainerComponent} from "../components/checkout-container/checkout-container.component";
import {CommonComponentsModule} from "../../shared/components/components.module";

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        IonicModule,
        CustomerOrderPageRoutingModule,
        MaterialModule,
        CommonComponentsModule
    ],
  declarations: [CustomerOrderPage, ItemsSummaryComponent, OrderSummaryComponent, CheckoutContainerComponent]
})
export class CustomerOrderPageModule {}
