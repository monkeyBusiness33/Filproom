import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PaymentsPageRoutingModule } from './payments-routing.module';

import { PaymentsPage } from './payments.page';
import { TableWrapperModule } from 'src/app/shared/table-wrapper/table-wrapper.module';
import { ModalModule } from 'src/app/shared/modal/modal.module';
import { MatTabsModule } from '@angular/material/tabs';
import { MaterialModule } from 'src/app/material.module';
import { CommonComponentsModule } from '../shared/components/components.module';
import { FliproomListModule } from '../shared/fliproom-list/fliproom-list.module';
import { PayoutFormComponent } from './modals/payout-form/payout-form.component';
import { TransactionFormComponent } from './modals/transaction-form/transaction-form.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ReactiveFormsModule,
    TableWrapperModule,
    FliproomListModule,
    MaterialModule,
    CommonComponentsModule,
    PaymentsPageRoutingModule
  ],
  declarations: [PaymentsPage, PayoutFormComponent, TransactionFormComponent]
})
export class PaymentsPageModule {}
