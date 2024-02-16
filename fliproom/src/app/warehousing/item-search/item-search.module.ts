import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ItemSearchPageRoutingModule } from './item-search-routing.module';

import { ItemSearchPage } from './item-search.page';
import { ItemSearchFilterComponent } from '../item-search-filter/item-search-filter.component';
import { MaterialModule } from 'src/app/material.module';
import { CommonComponentsModule } from 'src/app/shared/components/components.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ItemSearchPageRoutingModule,
    MaterialModule,
    CommonComponentsModule
  ],
  declarations: [
    ItemSearchPage,
    ItemSearchFilterComponent
  ]
})
export class ItemSearchPageModule {}
