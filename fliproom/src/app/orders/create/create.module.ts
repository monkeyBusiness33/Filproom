import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { CreatePageRoutingModule } from './create-routing.module';

import { CreatePage } from './create.page';
import { MaterialModule } from 'src/app/material.module';
import { SearchBarModule } from 'src/app/shared/search-bar/search-bar.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    CreatePageRoutingModule,
    MaterialModule,
    SearchBarModule,
  ],
  declarations: [CreatePage]
})
export class CreatePageModule {}
