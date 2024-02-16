import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { OrdersPageRoutingModule } from './orders-routing.module';

import { OrdersPage } from './orders.page';
import { TableWrapperModule } from 'src/app/shared/table-wrapper/table-wrapper.module';
import { MaterialModule } from 'src/app/material.module';
import { FliproomListModule } from '../shared/fliproom-list/fliproom-list.module';
import { FulfillmentFormComponent } from './modals/fulfillment-form/fulfillment-form.component';
import { OrdersListComponent } from './modals/orders-list/orders-list.component';
import { CheckoutPaymentReviewComponent } from './modals/checkout-payment-review/checkout-payment-review.component';
import { CancelOrderComponent } from './modals/cancel-order/cancel-order.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    TableWrapperModule,
    MaterialModule,
    OrdersPageRoutingModule,
    FliproomListModule
  ],
  declarations: [
    OrdersPage,
    FulfillmentFormComponent,
    OrdersListComponent,
    CheckoutPaymentReviewComponent,
    CancelOrderComponent
  ]
})
export class OrdersPageModule {}
