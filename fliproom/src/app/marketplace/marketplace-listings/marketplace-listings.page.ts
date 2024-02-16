import {Component, OnInit, ViewChild} from '@angular/core';
import {
  DataRequest,
  TableConfiguration,
  TableWrapperComponent
} from "../../shared/table-wrapper/table-wrapper.component";
import {FliproomListComponent} from "../../shared/fliproom-list/fliproom-list.component";
import {UserService} from "../../core/user.service";
import {ApiService} from "../../core/api.service";
import {ModalService} from "../../shared/modal/modal.service";
import {ActivatedRoute, Router} from "@angular/router";
import {ProductSearchComponent} from "../../shared/components/product-search/product-search.component";
import {filter, mergeMap} from "rxjs/operators";
import {Product} from "../../shared/models/Product.model";
import {MarketplaceAddListingFormComponent} from "../marketplace-listing-form/marketplace-listing-form.component";
import {MarketplaceListing} from "../../shared/models/MarketplaceList";
import { environment } from 'src/environments/environment'
import {CometchatService} from "../../core/cometchat.service";

@Component({
  selector: 'app-marketplace-listings',
  templateUrl: './marketplace-listings.page.html',
  styleUrls: ['./marketplace-listings.page.scss'],
})
export class MarketplaceListingsPage implements OnInit {
  @ViewChild('tableWrapper') tableWrapper: TableWrapperComponent
  @ViewChild('fliproomList') fliproomList: FliproomListComponent

  public environment = environment
  public tabSelected: string
  public myListings = false
  public tabs =  []
  public dataRequested

  public tableConfigs: TableConfiguration = new TableConfiguration({
    columnsConfig: [],
    tableKey: 'marketPlace',
    showColumnsSelection: true,
    rowHoverable: true,
    showAdvancedFilter: true,
    emptyTablePlaceholder: 'No Listing Available',
    dataSourceFnName: 'getMarketplaceListing' // pass this to allow table download
  })

  public emptyListPlaceholder: string = 'No Listing Available'

  public buttons = [
    {label: 'create listing', icon: 'add_box', id: 'add-listing'}
  ]

  constructor (
    public user: UserService,
    private _api: ApiService,
    private _modalCtrl: ModalService,
    private _router: Router,
    private _route: ActivatedRoute,
  ) {
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    this.myListings = Boolean(urlParams.get('myListings'))


    // check whether user is on my listings section
    if(!this.myListings){
        this.tabs = ['buy', 'sell']
        this.tabSelected = 'buy'
    }
    else {
      this.tabs = ['wtb', 'wts']
      this.tabSelected = 'wtb'
    }
    this.tableConfigs.columnsConfig = [
      { reference: 'product.imageReference', displayedName: 'Images', dataType: 'string', disableFilter: true },
      { reference: 'product.code', displayedName: 'SKU', dataType: 'string' },
      { reference: 'product.title', displayedName: 'Product', dataType: 'string' },
      { reference: 'variant.name', displayedName: 'Variant', dataType: 'string' },
      { reference: 'user.name', displayedName: 'Account', dataType: 'string' },
      { reference: 'quantityRequested', displayedName: 'Quantity Requested', dataType: 'number' },
      { reference: 'quantityClaimed', displayedName: 'Quantity Claimed', dataType: 'number' },
      { reference: 'price', displayedName: 'Price', dataType: 'number' },
      { reference: 'notes', displayedName: 'Notes', dataType: 'string' },
      { reference: 'status.name', displayedName: 'Status', dataType: 'string' }
    ]

    this.tableWrapper ? this.tableWrapper.ngOnInit() : null
    this.onRefresh()
  }

  ngOnInit (): void {}

  onRefresh() {
    this.tableWrapper ? this.tableWrapper.refresh() : null
    this.fliproomList ? this.fliproomList.refresh() : null
  }

  onSegmentChanged(data) {
    this.tabSelected = data.detail.value
    this.onRefresh()
  }

  onDataRequest (evt: DataRequest): void {
    //INTERNAL LISTINGS
    if(this.tabSelected == 'wtb'){
      evt.params['type'] = 'wtb'
      evt.params['user.accountID'] = this.user.account.ID
    }
    else if (this.tabSelected == 'wts'){
      evt.params['type'] = 'wts'
      evt.params['user.accountID'] = this.user.account.ID
    }
    //EXTERNAL LISTINGS
    // a want to sell (WTS) for an external user is a purchase for the logged user
    else if (this.tabSelected == 'buy') {
      evt.params['type'] = 'wts'
      evt.params['user.accountID'] = `!${this.user.account.ID}`
    }
    // a want to buy (WTB) for an external user is a sale for the logged user
    else if (this.tabSelected == 'sell'){
      evt.params['type'] = 'wtb'
      evt.params['user.accountID'] = `!${this.user.account.ID}`
    }

    this._api.getMarketplaceListings(evt.pageIdx, evt.pageSize, evt.sort, evt.params).subscribe(resp => this.dataRequested = resp)
  }

  onAddListing () {
    this._modalCtrl
      .open(ProductSearchComponent, {private: false, public: true})
      .pipe(
        filter(res => res),
        mergeMap((product: Product) => this._modalCtrl.open(MarketplaceAddListingFormComponent, product)),
        filter(res => res),
      ).subscribe((mpl: MarketplaceListing) => this._router.navigate([`/marketplace/detail/${mpl.ID}`]))
  }

  onRowClick(listing: MarketplaceListing) {
    this._router.navigate(['/marketplace/detail/' + listing.ID])
  }

  onButtonClick(buttonId: string) {
    if (buttonId == 'add-listing') {
      this.onAddListing()
    }
    return
  }

  getStatusClass(status) {
    return status === 'claimed' ? 'success' : status === 'deleted' ? 'error' : 'warning'
  }

}
