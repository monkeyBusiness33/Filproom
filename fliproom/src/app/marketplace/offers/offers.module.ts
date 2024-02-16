import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { OffersPageRoutingModule } from './offers-routing.module';

import { OffersPage } from './offers.page';
import {OffersListComponent} from "../components/offers-list/offers-list.component";
import {OfferChatComponent} from "../components/offer-chat/offer-chat.component";
import {StealsPageRoutingModule} from "../steals/steals-routing.module";
import {FliproomListModule} from "../../shared/fliproom-list/fliproom-list.module";
import {MaterialModule} from "../../material.module";
import {ModalModule} from "../../shared/modal/modal.module";
import {CommonComponentsModule} from "../../shared/components/components.module";
import {MarketPlacePageRoutingModule} from "../marketplace-routing.module";
import {MatChipsModule} from "@angular/material/chips";
import {
  CometChatImageViewer
} from "../../../cometchat-pro-angular-ui-kit/CometChatWorkspace/src/components/Messages/CometChat-image-viewer/cometchat-image-viewer.module";
import {
  CometChatMessageList
} from "../../../cometchat-pro-angular-ui-kit/CometChatWorkspace/src/components/Messages/CometChat-message-list/cometchat-message-list.module";

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    OffersPageRoutingModule,
    FliproomListModule,
    MaterialModule,
    ModalModule,
    CommonComponentsModule,
    MatChipsModule,
    CometChatImageViewer,
    CometChatMessageList,
  ],
  declarations: []
})
export class OffersPageModule {}
