import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';
import { SignupPageRoutingModule } from './signup-routing.module';
import { SignupPage } from './signup.page';
import { MaterialModule } from 'src/app/material.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    MaterialModule,
    SignupPageRoutingModule,
  ],
  declarations: [SignupPage]
})
export class SignupPageModule { }
