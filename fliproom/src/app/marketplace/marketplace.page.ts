import { Component, OnInit, ViewChild } from '@angular/core'
import { ApiService } from 'src/app/core/api.service'
import { UserService } from 'src/app/core/user.service'
import { environment } from 'src/environments/environment'
import { ModalService } from 'src/app/shared/modal/modal.service'


import {

  TableWrapperComponent
} from '../shared/table-wrapper/table-wrapper.component'

import { ActivatedRoute, Router } from '@angular/router'
import { FliproomListComponent } from '../shared/fliproom-list/fliproom-list.component'
import {CometchatService} from "../core/cometchat.service";


@Component({
  selector: 'app-marketplace',
  templateUrl: './marketplace.page.html',
  styleUrls: ['./marketplace.page.scss']
})
export class MarketPlacePage implements OnInit {
  @ViewChild('tableWrapper') tableWrapper: TableWrapperComponent
  @ViewChild('fliproomList') fliproomList: FliproomListComponent

  public environment = environment
  public listingType: string = 'wts'
  public dataRequested

  public emptyListPlaceholder: string = 'No Listing Available'

  public buttons = [
    {label: 'Steals', description: 'Browse hot deals on the marketplace', id: 'steals'},
    {label: 'Buy & Sell', description: 'Purchase and sell stock', id: 'buy-sell'},
    {label: 'Offers', description: 'Manage sent and received offers', id: 'offers'},
    {label: 'My Listings', description: 'Manage your listings', id: 'my-listings'},
  ]

  constructor (
    public user: UserService,
    private _api: ApiService,
    private _modalCtrl: ModalService,
    private _router: Router,
    private _route: ActivatedRoute,
    private _cometChat: CometchatService
  ) {
  }

  ngOnInit (): void {
    //Login to cometchat using account ID of logged user
    this._cometChat.loginUser((this.user.account.ID).toString(), this.user.deviceID)
  }

  // Menu Button Logic
  onButtonClick(buttonId: string) {
    if (buttonId == 'steals') {
      this._router.navigate(['/marketplace/steals'])
    }
    else if (buttonId == 'buy-sell') {
      this._router.navigate(['/marketplace/listings', {queryParams: {myListings: false}}])
    }
    else if (buttonId == 'offers') {
      this._router.navigate(['/marketplace/offers'])
    }
    else if (buttonId == 'my-listings') {
      this._router.navigate(['/marketplace/listings'], {queryParams: {myListings: true}})
    }
  }

}
