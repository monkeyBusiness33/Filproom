import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { TableWrapperModule } from 'src/app/shared/table-wrapper/table-wrapper.module';
import { MaterialModule } from 'src/app/material.module';
import { MarketPlaceDetailPage } from './marketplace-detail.page';
import { MarketPlaceDetailPageRoutingModule } from './marketplace-detail-routing.module';
import { ModalModule } from 'src/app/shared/modal/modal.module';
import { MarketplaceAddOfferFormComponent } from './listing-offer-form/listing-offer-form.component';
import { ShareListingComponent } from './share-listing/share-listing.component';

import { ShareModule } from 'ngx-sharebuttons';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    TableWrapperModule,
    MaterialModule,
    ModalModule,
    MarketPlaceDetailPageRoutingModule,
    ShareModule
  ],
  declarations: [
    MarketPlaceDetailPage,
    MarketplaceAddOfferFormComponent,
    ShareListingComponent
  ]
})
export class MarketPlaceDetailPageModule {}
