import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MarketPlacePageRoutingModule } from './marketplace-routing.module';

import { MarketPlacePage } from './marketplace.page';
import { TableWrapperModule } from 'src/app/shared/table-wrapper/table-wrapper.module';
import { MaterialModule } from 'src/app/material.module';
import { ModalModule } from 'src/app/shared/modal/modal.module';
import { CommonComponentsModule } from '../shared/components/components.module';
import { FliproomListModule } from '../shared/fliproom-list/fliproom-list.module';
import {MarketplaceAddListingFormComponent} from "./marketplace-listing-form/marketplace-listing-form.component";
import {MatChipsModule} from "@angular/material/chips";
import {StealsPage} from "./steals/steals.page";
import {OffersListComponent} from "./components/offers-list/offers-list.component";
import {OfferChatComponent} from "./components/offer-chat/offer-chat.component";
import {
    CometChatImageViewer
} from "../../cometchat-pro-angular-ui-kit/CometChatWorkspace/src/components/Messages/CometChat-image-viewer/cometchat-image-viewer.module";
import {
  CometChatMessageList
} from "../../cometchat-pro-angular-ui-kit/CometChatWorkspace/src/components/Messages/CometChat-message-list/cometchat-message-list.module";
import {OffersPage} from "./offers/offers.page";


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    TableWrapperModule,
    FliproomListModule,
    MaterialModule,
    ModalModule,
    CommonComponentsModule,
    MarketPlacePageRoutingModule,
    MatChipsModule,
    MaterialModule,
    CometChatImageViewer,
    CometChatMessageList,
  ],
  declarations: [
    MarketPlacePage,
    StealsPage,
    OffersPage,
    MarketplaceAddListingFormComponent,
    OffersListComponent,
    OfferChatComponent
  ]
})
export class MarketPlacePageModule {}
