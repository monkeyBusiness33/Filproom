import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { CreatePageRoutingModule } from './create-routing.module';

import { CreatePage } from './create.page';
import {MatFormFieldModule} from "@angular/material/form-field";
import {MatSelectModule} from "@angular/material/select";
import {MatInputModule} from "@angular/material/input";
import {MatButtonModule} from "@angular/material/button";
import {MatIconModule} from "@angular/material/icon";

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        IonicModule,
        CreatePageRoutingModule,
        MatFormFieldModule,
        MatSelectModule,
        ReactiveFormsModule,
        MatInputModule,
        MatButtonModule,
        MatIconModule
    ],
  declarations: [CreatePage]
})
export class CreatePageModule {}
