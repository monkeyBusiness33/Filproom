import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { AddressContactPageRoutingModule } from './address-contact-routing.module';

import { AddressContactPage } from './address-contact.page';
import {MatFormFieldModule} from "@angular/material/form-field";
import {MatIconModule} from "@angular/material/icon";
import {MaterialModule} from "../../../material.module";
import {FliproomListModule} from "../../../shared/fliproom-list/fliproom-list.module";

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        IonicModule,
        AddressContactPageRoutingModule,
        MatFormFieldModule,
        MatIconModule,
        MaterialModule,
        FliproomListModule
    ],
  declarations: [AddressContactPage]
})
export class AddressContactPageModule {}
