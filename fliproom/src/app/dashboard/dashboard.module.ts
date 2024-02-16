import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { DashboardPageRoutingModule } from './dashboard-routing.module';

import { DashboardPage } from './dashboard.page';
import { ViewReportComponent } from './modals/view-report/view-report.component';
import { MaterialModule } from '../material.module';


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DashboardPageRoutingModule,
    CommonModule,
    MaterialModule,
  ],
  declarations: [DashboardPage, ViewReportComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DashboardPageModule {}
