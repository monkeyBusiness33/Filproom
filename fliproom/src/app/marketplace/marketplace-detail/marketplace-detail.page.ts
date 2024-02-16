import { Component, OnInit } from '@angular/core'
import { Meta } from '@angular/platform-browser'
import { Router, ActivatedRoute } from '@angular/router'
import { filter, map, mergeMap } from 'rxjs/operators'
import { ApiService } from 'src/app/core/api.service'
import { UserService } from 'src/app/core/user.service'
import { IModalResponse, ModalService } from 'src/app/shared/modal/modal.service'
import { environment } from 'src/environments/environment'
import { MarketplaceAddOfferFormComponent } from './listing-offer-form/listing-offer-form.component'
import { ShareListingComponent } from './share-listing/share-listing.component'
import { MarketplaceOffer } from 'src/app/shared/models/MarketplaceOffer'
import { MarketplaceListing } from 'src/app/shared/models/MarketplaceList'
import {CometchatService} from "../../core/cometchat.service";

@Component({
  selector: 'marketplace-detail',
  templateUrl: './marketplace-detail.page.html',
  styleUrls: ['./marketplace-detail.page.scss']
})
export class MarketPlaceDetailPage implements OnInit {
  constructor (
    public user: UserService,
    private _api: ApiService,
    private _router: Router,
    private _route: ActivatedRoute,
    private _modalCtrl: ModalService,
    private _cometChat: CometchatService,

  ) {}

  public marketplaceListing: MarketplaceListing
  public environment = environment
  public isLoading: boolean = false

  public buttons = [] // list is populated upon listing fetching

  ngOnInit (): void {
    this._route.params.subscribe(params => this.fetchMarketplaceListingDetail())
  }


  fetchMarketplaceListingDetail () {
    this.isLoading = true
    this._api.getMarketplaceListingDetail(this._route.snapshot.paramMap.get('marketplaceListingID'))
    .subscribe((listing: MarketplaceListing) => {
      this.marketplaceListing = listing
      this.isLoading = false

      this.buttons = [
        {label: 'share', icon: 'share', id: 'share'},
      ]
      // check if user can delete the listing
      if (this.user.ID == this.marketplaceListing.userID && this.marketplaceListing.status.name != 'deleted') {
        this.buttons.push({label: 'delete', icon: 'delete', id: 'delete'})
      }
    })
  }

  get sortedOffers(): MarketplaceOffer[] {
    //TODO - move to backend later - show only own offers if user doesn;t own the listing
    const visibleOffers = this.marketplaceListing.marketplaceOffers.filter((o: MarketplaceOffer) => (o.userID == this.user.ID || this.marketplaceListing.userID == this.user.ID))
    return visibleOffers.sort((offerA, offerB) => offerA.status.name == "pending" ? -1 : 1)
  }

  getProgress () {
    return (this.marketplaceListing.quantityClaimed / this.marketplaceListing.quantityRequested) * 100
  }

  onDeleteListing() {
    // check if all offers declined
    if (this.marketplaceListing.pendingOffers.length > 0) {
      this._modalCtrl.warning('You have to cancel all the offers before you delete')
      return
    }

    this._modalCtrl.confirm('Are you sure you want to delete this listing?').pipe(
      filter(res => res),
      mergeMap(() => this._api.deleteMarketplaceListing(this.marketplaceListing.ID))
    ).subscribe(resp => {
        this._modalCtrl.info('Listing deleted')
        this.fetchMarketplaceListingDetail()
      })
  }

  getStatusClass(status) {
    return status === 'claimed' ? 'success' : status === 'deleted' ? 'error' : 'warning'
  }

  onMenuButtonClick(buttonId: string) {
    if (buttonId == 'share') {
      this._modalCtrl.open(ShareListingComponent, this.marketplaceListing)
    } else if (buttonId == 'delete') {
      this.onDeleteListing()
    }
    return
  }

  canPlaceOffer(): boolean {
    // can place offer it not listing owner, listing is still open and you don;t have already a pending offer
    const userPendingOffers = this.marketplaceListing.pendingOffers().find((o: MarketplaceOffer) => o.userID == this.user.ID)
    return this.user.ID !== this.marketplaceListing.user.ID && this.marketplaceListing.status.name !== 'claimed' && !userPendingOffers
  }

  onPlaceAnOffer () {
    this._modalCtrl
      .open(MarketplaceAddOfferFormComponent, {list: this.marketplaceListing})
      .subscribe(resp => {
        this.fetchMarketplaceListingDetail()
      })
  }

  onOfferClick(offer: MarketplaceOffer) {
    const actions = []
    actions.push({icon: 'done', title: 'Messages', description: '', disabled: false, key: 'chat'})
    // no actions allowed if listing has been claimed already or offer is not pending or user not ownes either the listing or the offer
    if ( (this.user.ID === this.marketplaceListing.userID && this.user.ID == offer.userID)) {
      return
    }

    // offer's actions for the listing owner
    if (this.user.ID === this.marketplaceListing.userID) {
      if (offer.status.name === 'pending') {
        actions.push({icon: 'done', title: 'Decline', description: '', disabled: false, key: 'decline'})
        actions.push({icon: 'done', title: 'Accept', description: '', disabled: false, key: 'accept'})
      }
    } else if (this.user.ID == offer.userID) { // offer's action for your offer
      if(offer.status.name === 'pending'){
        actions.push({icon: 'done', title: 'Update', description: '', disabled: false, key: 'update'})
      }
      actions.push({icon: 'done', title: 'Delete', description: '', disabled: false, key: 'delete'})
    }

    this._modalCtrl
      .actionSheet('Actions', actions)
      .pipe(
        filter((resp: IModalResponse) => resp.role == "submit"),
        map((resp: IModalResponse) => resp.data),
      )
      .subscribe((action: string) => {
        switch (action) {
          case 'update':
            this._modalCtrl
            .open(MarketplaceAddOfferFormComponent, {
              list: this.marketplaceListing,
              offer: offer
            })
            .subscribe(resp => this.fetchMarketplaceListingDetail())
            break
          case 'accept':
            this.updateOfferStatus(offer, 'approved')
            break
          case 'decline':
            this.updateOfferStatus(offer, 'declined')
            this
            break
          case 'delete':
            this._modalCtrl.confirm('You sure you want to delete this offer?').pipe(
              filter(res => res),
            ).subscribe(() => this.updateOfferStatus(offer, 'deleted'))
            break
          case 'chat':
            this._router.navigate(['marketplace/offers'], {queryParams:
                {offer: offer.ID, type: this.marketplaceListing.user.accountID == this.user.account.ID ? 'received':'sent'}
            })
            //window.location.replace(`marketplace/offers?${offer.ID}`)
            return
        }
      })
  }

  updateOfferStatus (offer: MarketplaceOffer, status: string) {
    this.isLoading = true
    this._api.updateMarketplaceListingOffer(offer.ID, {status: status})
    .subscribe(resp => {
      this._modalCtrl.success('Offer Status Updated')
      console.log(offer.cometChatGroup.guid)
      this._cometChat.sendTextMessageGroup(offer.cometChatGroup.guid,[`[OFFER ${status.toUpperCase()}]`])
      this.fetchMarketplaceListingDetail()
    })
  }

  get title(): string{
    if ( this.marketplaceListing.user.accountID  == this.user.account.ID){
      return this.marketplaceListing.type == 'wts'  ? 'Want To Sell' : 'Want To Buy'
    }
    else {
      return this.marketplaceListing.type == 'wts'  ? 'Buy' : 'Sell'
    }
  }
}
