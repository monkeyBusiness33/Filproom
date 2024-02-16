import {Component, ElementRef, Inject, Input, OnInit, ViewChild} from '@angular/core';
import { ModalController } from '@ionic/angular';
import { ApiService } from 'src/app/core/api.service';
import { Product } from '../../models/Product.model';
import {MAT_DIALOG_DATA} from "@angular/material/dialog";
import {FliproomListComponent} from "../../fliproom-list/fliproom-list.component";
import {ModalService} from "../../modal/modal.service";
import { ActivatedRoute, Router } from '@angular/router';
import {UserService} from "../../../core/user.service";
import {filter, mergeMap, take, takeUntil} from "rxjs/operators";
import {of} from "rxjs";
import { environment } from 'src/environments/environment';
import { ToursService } from 'src/app/core/tours.service';
import {FormPage} from "../../../products/form/form.page";


export interface IProductSearchInput {
  private?: boolean;
  public?: boolean; // TODO: remove this and use catalogueSelected
  consignment?: boolean;
  accountID?: number;
  searchQuery?: string;
  prefilledSearchText?: string;
  redirectTo?: string
  catalogueSelected?: string;
  createExpressProduct?: boolean;
  allowImport?: boolean;
}


@Component({
  selector: 'app-product-search',
  templateUrl: './product-search.component.html',
  styleUrls: ['./product-search.component.scss'],
})



export class ProductSearchComponent implements OnInit {
  /**
   * Module used to select products from private or public catalogue or import product from stockx.
   *
   * Product module is used in
   *    inventory    - add inventory (private and consignment catalogues)
   *    listing form - match product on external account (private catalogue and external accountID)
   *    marketplace  - search among public products (public catalogue)
   *    POS system   - search product to add to order (private catalogue)
   *    transfers    - select product to add to transfer (private catalogue)
   *    product form - set synced product and select template product (public catalogue)
   *
   *    CONSIGNMENT CATALOGUE:
   *      - 1. show external products
   *      - 2. on consignment product selection:
   *            a. find existing prod match => return prod
   *            b. no match found => create product
   */

  public dataRequested = null;
  public environment = environment;
  public catalogueSelected: string;

  @Input() data: IProductSearchInput
  @ViewChild('fliproomList') fliproomList: FliproomListComponent;
  @ViewChild('cataloguesTabs') cataloguesTabs;

  public catalogues: string[] = []
  public prefilledSearchText: string;
  public redirectTo: string;



  constructor(
    private _api: ApiService,
    private _modalCtrl: ModalController,
    private _modal: ModalService,
    private _router: Router,
    public user: UserService,
    public _route: ActivatedRoute,
    public tourService: ToursService,
  ) { }

  ngOnInit() {


    // show private products if private:false not passed as param
    if (this.data?.private != false) {
      this.catalogues.push('private')
    }

    //TODO: Use catalogueSelected instead of public

    // show public products if public:true passed as param
    if (this.data?.public == true) {
      this.catalogues.push('public')
    }

    // show consignment catalogue if consignment:true is passed as a param
    if (this.data?.consignment == true) {
      this.catalogues.push('consignment')
    }

    if (this.data?.catalogueSelected == 'laced') {
      this.catalogues = ['laced']
    }

    // show product to sync if exist
    if (this.data?.prefilledSearchText) {
      this.prefilledSearchText = this.data.prefilledSearchText
    }

    // track redirectTo if is passed as a param (Ex: redirectTo: 'inventory')
    if (this.data?.redirectTo) {
      this.redirectTo = this.data.redirectTo
    }

    if (this.data?.catalogueSelected == 'consignment' && this.data?.consignment == true) {
      this.catalogueSelected = 'consignment'
    }
    else {
      this.catalogueSelected = this.catalogues[0]
    }


    this.onRefresh()
  }

  ionViewDidEnter() {
    // if in a tour, trigger next step which will focus the search bar
    if (this._route.snapshot.queryParams.tour == 'sell-item') {
      setTimeout(() => {
        this.tourService.startTour('sell-item', {page: 'product-search'})
      }, 300)

      //listen for button click and close tour
      const tourClickSub = this.tourService.tourHighlightClickObs
          .subscribe((data) => {
            if (data.stepId == 'your-products') {
              this.catalogueSelected = 'private'
              this.onRefresh()
            } else if (data.stepId == 'click-consignment') {
              this.catalogueSelected = 'consignment'
              this.onRefresh()
        }
      })
    }
  }

  ionViewWillLeave() {
    this._modalCtrl.dismiss(null, 'submit')
  }

  onSegmentChanged(){
    this.onRefresh()
  }

  onDataRequest(evt) {
    evt.params['public'] = this.catalogueSelected == 'public'
    evt.params['status'] = '!deleted'
    let pageSize = 30 //default page size

    //Searching to laced catalogue can only be done with a limit of 20
    if(this.catalogueSelected == 'laced') {
      pageSize = 20
      evt.params['catalogue']= 'laced'
    }

    if (evt.params['public'] === false) {
      if(this.catalogueSelected == 'consignment'){
        evt.params['accountIDs'] = this.user.account.externalSaleChannelAccountIDs
      }
      else{
        evt.params['accountID'] = this.data?.accountID || this.user.account.ID
      }
    }

    const searchQuery = this.fliproomList.activeSearch || this.data.searchQuery
    if (searchQuery) {
      evt.params['search'] = searchQuery
    }


    this._api.getProductsList(evt.pageIdx, pageSize, evt.sort, evt.params).subscribe((resp) => {
      this.dataRequested = resp;
    });
  }

  onRowClick(product: Product) {
    this.fliproomList.isLoading = true
    // if on consignment tab
    if(product.accountID && this.user.account.ID != product.accountID && this.catalogueSelected == 'consignment'){
      //TODO: add proper handling
      if(this.user.isPersonalShopper){
        this._modalCtrl.dismiss(product, 'submit')
      }
      // find or create product with variant matches
      else {
        this._api.importProduct(product.ID).subscribe(internalProduct => {
          this._modalCtrl.dismiss(internalProduct, 'submit')
        })
      }

    }
    //laced catalogue product selected
    else if(this.catalogueSelected == 'laced'){
      //Fetch complete laced product
      this._api.getLacedProduct(product.lacedID).subscribe(_product => {
        this._modalCtrl.dismiss(_product, 'submit')
      })
    }

    else {
      this._api.getProduct(product.ID).subscribe(_product => {
        this._modalCtrl.dismiss(_product, 'submit')
      })
    }

  }

  onClose() {
    this._modalCtrl.dismiss(null, 'submit')
  }

  onRefresh() {
    this.fliproomList ? this.fliproomList.refresh() : null
  }

  get placeholderButtonText(): string {
    // if express product creation is enabled - suggest to create product
    if( this.data.createExpressProduct && this.user.iam.product.create && this.user.isPersonalShopper){
      return 'Create product'
    }
    // if in private products catalogue and consignment products catalogue not availabe - suggest to import product
    if (this.catalogueSelected== 'private' && this.user.iam.product.create  && !this.consignmentProductsAvailable && !this.user.isPersonalShopper) {
      return 'Import product'
    }

    // if in consignment products catalogue - suggest to import product
    if (this.catalogueSelected== 'consignment' && this.user.iam.product.create && this.consignmentProductsAvailable) {
      return 'Import product'
    }
    else if(this.catalogueSelected== 'private' && this.consignmentProductsAvailable ){
      return 'Search in Consignment Catalogue'
    }
    else if (this.catalogueSelected == 'public') {
      return 'Import product from StockX '
    } else {
      return ''
    }
  }

  get showNoDataButton(): boolean {
     return this.dataRequested && this.dataRequested.data.length == 0 && !this.fliproomList.isLoading
  }

  get noDataDisplayMessage(): string {
    if (this.catalogueSelected == 'consignment' && !this.user.isPersonalShopper){
      return 'No consignment products available, please contact consignment store to create product'
    }
    else if (this.catalogueSelected == 'consignment' && this.user.isPersonalShopper){
        return 'No products available, ask seller to create product or create it yourself'
    }
    else if (this.catalogueSelected == 'private' && this.user.isPersonalShopper){
      return 'No products available, ask your team to create product or create it yourself'
    }
    else if (this.catalogueSelected == 'private'){
      return 'No products found on your account catalogue'
    }
    else if (this.catalogueSelected == 'laced'){
      return 'No products found on Laced catalogue'
    }
    else if (this.catalogueSelected == 'public'){
      return 'No template products available'
    }
    else {
      return ''
    }

  }

  get consignmentProductsAvailable(){
    return this.catalogues.find((tab)=> tab == 'consignment')
  }

  tabDisplayName(tab){
    switch(tab) {
      case 'private':
        return 'my products'
      case 'public':
        return 'template products'
      case 'laced':
        return 'laced products'
      case 'consignment':
        return 'consignment products'
      default:
        return this.catalogueSelected

    }
  }

  onPlaceholderButtonClick(action) {
    switch(action) {
      case 'create':
        let subscription = of('prod')
        if(this.catalogueSelected == 'consignment'){
          subscription = this._modal.confirm('Please note even if you create a product you will not be able to consign it until the consignment store creates the same product on their end')
        }
        subscription.subscribe(res => {
          if(res){
            this.onClose()
            let params: any = { queryParams: { formType: 'create' }};
            (this.redirectTo) ? params.queryParams.redirectTo = this.redirectTo : null;
            this._router.navigate(['/products/form'], params)
          }
        })
        break;
      case 'express-create':
        this._modal.open(FormPage,{express:true}).subscribe(product => {
            if(product){
                this.onRowClick(product)
            }
        })
        break;
      case 'goto-consignment':
        this.catalogueSelected = 'consignment' // got to consignment catalogue
        this.onSegmentChanged()
        break;
      case 'import-template':
        this.onClose()
        this._router.navigate(['/products'], {queryParams: {product_mode: 'public', variant_mode: 'disabled'}})
        break;
      case 'import':
        this.onStockxImportRequest()
        break;

    }
  }

  //action if public catalogue is empty
  onStockxImportRequest() {
    // enabled only if list is using public products. request import of a stockx product from its url
    this._modal.input({title: 'stockx url', subtitle: 'past here the url of the stockx product to import', type: 'string'}).pipe(
      filter(res => res),
      mergeMap(unformattedStockxUrl => {
        this._modal.info('Searching for the product on the market..')
        return this._api.stockxApiImportRequest(unformattedStockxUrl)
      })
    )
    .subscribe((res) => {
      if (res.length > 0) {
        this._modal.success('Product found. Import queued check again shortly')
        return res[0]
      } else {
        this._modal.warning('Product not found. Be sure to have imported a valid url')
        return null
      }
    })
  }
}
