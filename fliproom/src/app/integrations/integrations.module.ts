import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { IntegrationsPageRoutingModule } from './integrations-routing.module';

import { IntegrationsPage } from './integrations.page';
import { PayoutSetupFormComponent } from './payout-setup-form/payout-setup-form.component';
import { MaterialModule } from 'src/app/material.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    IntegrationsPageRoutingModule,
    MaterialModule
  ],
  declarations: [
    IntegrationsPage,
    PayoutSetupFormComponent
  ]
})
export class IntegrationsPageModule {}
