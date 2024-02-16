import { Component, Inject, Input, OnInit } from '@angular/core'
import {FormControl, FormGroup, Validators} from '@angular/forms'
import { MAT_DIALOG_DATA } from '@angular/material/dialog'
import { ModalController } from '@ionic/angular'
import { ApiService } from 'src/app/core/api.service'
import { ModalService } from 'src/app/shared/modal/modal.service'
import { MarketplaceListing } from 'src/app/shared/models/MarketplaceList'
import { MarketplaceOffer } from 'src/app/shared/models/MarketplaceOffer'
import { environment } from 'src/environments/environment'
import {CometchatService} from "../../../core/cometchat.service";
import {UserService} from "../../../core/user.service";
import {Router} from "@angular/router";

interface AddFormComponentData {
  list?: MarketplaceListing
  offer?: MarketplaceOffer
}

@Component({
  selector: 'listing-offer-form',
  templateUrl: './listing-offer-form.component.html',
  styleUrls: ['./listing-offer-form.component.scss']
})
export class MarketplaceAddOfferFormComponent implements OnInit {
  @Input('data') data: AddFormComponentData

  public isLoadingForm = false
  public isLoadingUpdate = false
  public isLoading: boolean = false
  public formMode = 'create' // edit, create
  public listing: MarketplaceListing
  public offer: MarketplaceOffer

  public environment = environment

  public tagsArray = []

  public listOfferForm = new FormGroup({
    quantity: new FormControl(null, [Validators.required]),
    price: new FormControl(null, [Validators.required]),
  })

  constructor (
    private _api: ApiService,
    private _modal: ModalService,
    private _modalCtrl: ModalController,
    private _router: Router,
    private _cometChat: CometchatService,
    private _user: UserService

  ) {}

  ngOnInit (): void {
    this.listing = this.data.list

    if (this.data.offer) {
      this.formMode = 'edit'
      this.offer = this.data.offer
      this.listOfferForm.patchValue({
        quantity: this.offer.quantity,
        price: this.offer.price,
      })
    }
  }

  onSubmit () {
    let listItem = this.listOfferForm.value
    if (listItem.quantity > this.listing.claimableQuantity) {
      this._modal.error('Max quantity claimable: ' + this.listing.claimableQuantity)
      return
    }
    if (listItem.quantity < 1) {
      this._modal.error('Quantity should be at least 1')
      return
    }
    if (!listItem.price || listItem.price < 1) {
      this._modal.error('No price is entered')
      return
    }
    // create comet chat user if it does not exist
    this._cometChat.createUser((this._user))

    this.isLoading = true
    const payload = {
      ...listItem,
      marketplaceListingID: this.listing.ID
    }
    if (this.formMode === 'create') {
      this._api.addMarketplaceListingOffer(payload).subscribe(_resp => {
        setTimeout(() => {
          this.isLoading = false
          let triggerWord = this.listing.type == 'wts' ? 'buy' : 'sell'
          let messages = [`I'd like to buy this ${this.listing.product.title} ${this.listing.variant.name} for ${this._user.account.currency} ${this.listOfferForm.value.price} `]
          this._cometChat.sendTextMessageGroup(_resp.cometChatGroup.guid, messages)
          this._modal.success('Marketplace offer created successfully')
          this._modalCtrl.dismiss(_resp, 'submit')
          this._router.navigate(['marketplace/offers'], {queryParams:
              {offer: _resp.ID, type: _resp.user.accountID == _resp.marketplaceListing.user.accountID ? 'received':'sent'}
          })
        }, 500)
      })
    } else {
      this._api.updateMarketplaceListingOffer(this.offer.ID, this.listOfferForm.value)
        .subscribe(resp => {
          setTimeout(() => {
            this.isLoading = false
            let messages = this.generateUpdatedOfferMessage(this.offer, resp)
            this._cometChat.sendTextMessageGroup(resp.cometChatGroup.guid, messages)
            this._modal.success('Marketplace offer updated successfully')
            this._modalCtrl.dismiss(resp, 'submit')
            this._router.navigate(['marketplace/offers'], {queryParams:
                {offer: resp.ID, type: resp.user.accountID ==  resp.marketplaceListing.user.accountID ? 'received':'sent'}
            })
          }, 500)
        })
    }
  }

  generateUpdatedOfferMessage(previousOffer, newOffer){
    let messages = []
    if(previousOffer.price != newOffer.price ){
      messages.push(`[OFFER PRICE CHANGED] ${this._user.account.currency} ${previousOffer.price} -> ${this._user.account.currency} ${newOffer.price}`)
    }
    if(previousOffer.quantity != newOffer.quantity ){
      messages.push(`[OFFER QUANTITY CHANGED] ${previousOffer.quantity} ->  ${newOffer.quantity}`)
    }

    return messages
  }

  onClose () {
    this._modalCtrl.dismiss()
  }
}
