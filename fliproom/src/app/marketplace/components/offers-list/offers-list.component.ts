import {Component, EventEmitter, Input, OnInit, Output, ViewChild} from '@angular/core';
import {DataRequest} from "../../../shared/table-wrapper/table-wrapper.component";
import {ApiService} from "../../../core/api.service";
import {ActivatedRoute, Router} from "@angular/router";
import {ModalService} from "../../../shared/modal/modal.service";
import {UserService} from "../../../core/user.service";
import {FliproomListComponent} from "../../../shared/fliproom-list/fliproom-list.component";
import { environment } from 'src/environments/environment';
import {Product} from "../../../shared/models/Product.model";
import {MarketplaceOffer} from "../../../shared/models/MarketplaceOffer";


@Component({
  selector: 'app-offers-list',
  templateUrl: './offers-list.component.html',
  styleUrls: ['./offers-list.component.scss'],
})
export class OffersListComponent implements OnInit {

  @ViewChild('fliproomList') fliproomList: FliproomListComponent;
  @Output() offerSelected: EventEmitter<any> = new EventEmitter();
  @Input() selectedOffer: MarketplaceOffer

  public environment = environment
  public tabs = ['sent', 'received']

  public dataRequested;
  public isLoading: boolean =  true;

  public offersType  = 'sent'
  constructor(
    private _api: ApiService,
    private _route: ActivatedRoute,
    private _modalCtrl: ModalService,
    private _router: Router,
    public user: UserService
  ) { }

  ngOnInit() {
    this.onRefresh()
  }


  ionViewWillEnter() {
    this.onRefresh()
  }

  onRefresh() {
    this.fliproomList ? this.fliproomList.refresh() : null
  }

  onDataRequest(evt: DataRequest): void {
    //OFFER PRESELCTION CHECKS
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    const offerID = urlParams.get('offer')
    const offersType = urlParams.get('type')
    const offerPreselected = offerID && offersType
    //change selected type
    if(offersType){
      this.offersType = offersType
    }
    this._api.getOffers(evt.pageIdx, 99999, evt.sort, {type: this.offersType, 'status.name': '!deleted'}).subscribe( (resp) => {
      this.dataRequested = resp;
      //If offer was pre-selected (available in queryParams)
      if(offerPreselected){
        this.onOfferSelected(resp.data.find(_offer => _offer.ID == offerID))
      }
      // if no offer is selected, select the first one available
      if(!this.selectedOffer && resp.data.length > 0 && this.environment.screenType !='mobile'){
        this.onOfferSelected(resp.data[0])
      }
      this.isLoading = false
    })
  }

  onSegmentChanged(evt){
    this.offersType = evt.detail.value
    this._router.navigate([], {relativeTo: this._route, queryParams: {}, queryParamsHandling: ''});
    this.onOfferSelected(null)
    //this.inventoryTypeChange.emit({value: this.inventoryType})
    this.onRefresh()
  }

  onOfferSelected(offer: MarketplaceOffer) {
    this.selectedOffer = offer
      this.offerSelected.emit(offer)
  }

  getOfferStatusTagColour(status){
    if(status == 'approved'){
      return 'success'
    }
    else if (status == 'declined'){
      return 'error'
    }
    else {
      return 'warning'
    }
  }

  //changes name of type if it is an external offer
  getOfferType(offer :MarketplaceOffer){
    if(this.offersType == 'received'){
      return offer.marketplaceListing.type
    }
    else {
      return offer.marketplaceListing.getCounterType(offer.marketplaceListing.type)
    }
  }

}
