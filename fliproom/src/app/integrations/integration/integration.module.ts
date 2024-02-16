import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { IntegrationPageRoutingModule } from './integration-routing.module';

import { IntegrationPage } from './integration.page';
import { MaterialModule } from 'src/app/material.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    MaterialModule,
    IntegrationPageRoutingModule
  ],
  declarations: [IntegrationPage]
})
export class IntegrationPageModule {}
