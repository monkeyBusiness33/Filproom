import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MarketplaceListingsPageRoutingModule } from './marketplace-listings-routing.module';

import { MarketplaceListingsPage } from './marketplace-listings.page';
import {TableWrapperModule} from "../../shared/table-wrapper/table-wrapper.module";
import {FliproomListModule} from "../../shared/fliproom-list/fliproom-list.module";
import {MatIconModule} from "@angular/material/icon";
import {MatButtonModule} from "@angular/material/button";
import {MatTableModule} from "@angular/material/table";
import {MatSortModule} from "@angular/material/sort";
import {MaterialModule} from "../../material.module";

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        IonicModule,
        MarketplaceListingsPageRoutingModule,
        TableWrapperModule,
        FliproomListModule,
        MatIconModule,
        MatButtonModule,
        MatTableModule,
        MatSortModule,
        MaterialModule
    ],
  declarations: [MarketplaceListingsPage]
})
export class MarketplaceListingsPageModule {}
