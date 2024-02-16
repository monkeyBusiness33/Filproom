import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ReportsPageRoutingModule } from './reports-routing.module';

import { ReportsPage } from './reports.page';
import { MaterialModule } from '../material.module';
import { TableWrapperModule } from '../shared/table-wrapper/table-wrapper.module';
import { ItemsFlowComponent } from './items-flow/items-flow.component';
import { InvoicesComponent } from './invoices/invoices.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    TableWrapperModule,
    MaterialModule,
    ReportsPageRoutingModule,
  ],
  declarations: [
    ReportsPage,
    ItemsFlowComponent,
    InvoicesComponent
  ]
})
export class ReportsPageModule {}
