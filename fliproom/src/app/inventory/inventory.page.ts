import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Route, Router } from '@angular/router';
import { ApiService } from 'src/app/core/api.service';
import { Account, UserService } from 'src/app/core/user.service';
import { DataRequest, TableConfiguration, TableWrapperComponent } from 'src/app/shared/table-wrapper/table-wrapper.component';
import { environment } from 'src/environments/environment';
import { Location } from '@angular/common';
import { FliproomListComponent } from '../shared/fliproom-list/fliproom-list.component';
import { ModalService, IModalResponse } from '../shared/modal/modal.service';
import { ProductSearchComponent } from '../shared/components/product-search/product-search.component';
import { Product, ProductVariant } from '../shared/models/Product.model';
import { InventoryRecord } from '../shared/models/InventoryRecord';
import {Observable, Subscription, of} from "rxjs";
import {filter, map, mergeMap, take, takeUntil} from "rxjs/operators";
import { ViewEncapsulation} from '@angular/core';
import { ToursService } from '../core/tours.service';
@Component({
  selector: 'app-inventory',
  templateUrl: './inventory.page.html',
  styleUrls: ['./inventory.page.scss'],
  encapsulation: ViewEncapsulation.None
})
export class InventoryPage {
  @ViewChild('tableWrapper') tableWrapper: TableWrapperComponent;
  @ViewChild('fliproomList') fliproomList: FliproomListComponent;

  public environment = environment
  public inventoryWarehouse: string = 'all';
  public dataRequested;
  public tabs = ['all']
  private _activeSubs: Subscription[] = []

  public tableConfigs: TableConfiguration = new TableConfiguration({
    columnsConfig: [
      {reference: 'product.imageReference',      displayedName: 'Images',      dataType: 'string', disableFilter: true},
      {reference: 'product.code',                displayedName: 'SKU',         dataType: 'string'},
      {reference: 'product.title',               displayedName: 'Product',     dataType: 'string'},
      {reference: 'product.category.name',       displayedName: 'Product Category',     dataType: 'string'},
      {reference: 'variant.name',                displayedName: 'Variant',     dataType: 'string'},
      {reference: 'account.ID',                  displayedName: 'Account ID',  dataType: 'string'},
      {reference: 'account.name',                displayedName: 'Account',     dataType: 'string'},
      {reference: 'quantity',                    displayedName: 'Total QTY',    dataType: 'number'},
      {reference: 'quantityIncoming',                    displayedName: 'Incoming',    dataType: 'number'},
      {reference: 'quantityAtHand',                    displayedName: 'Location QTY',    dataType: 'number'},
      {reference: 'cost',                        displayedName: 'Cost',        dataType: 'number'},
      {reference: 'listingsQuantity',      displayedName: 'Active Listings',      dataType: 'number', disableFilter: true},
      {reference: 'warehouse.name',              displayedName: 'Location',       dataType: 'string'},
      {reference: 'notes',                       displayedName: 'Notes',       dataType: 'string'},
    ],
    tableKey: 'inventory',
    rowHoverable: true,
    showColumnsSelection: true,
    showAdvancedFilter: true,
    emptyTablePlaceholder: 'No Inventory Available',
    dataSourceFnName: 'getInventory' // pass this to allow table download
  })

  public buttons = []
  constructor(
    public user: UserService,
    private _api: ApiService,
    private location: Location,
    private _route: ActivatedRoute,
    private _router: Router,
    private _modalCtrl: ModalService,
    public tourService: ToursService
  ) {
    this.user.account.warehouses.map(wh => this.tabs.push(wh.name))

    //Permission checks on inventory
    if (user.iam.inventory.virtual) {
      this.tabs.push('virtual')
    }

    // if user is consignor, show external location tab
    if (user.account.saleChannels.find(sc => sc.accountID != user.account.ID)) {
      this.tabs.push('external')
    }

    this.tabs.push('incoming')

    if (user.iam.inventory.create){
      this.buttons.push( {label: 'sell items', icon: 'add_box', id: 'add-inventory'})
    }

    //  Hiding cost if permission false.
    if (!user.iam.inventory.view_cost || !this.trackCost) {
      this.tableConfigs.columnsConfig = this.tableConfigs.columnsConfig.filter(column => column.reference !== 'cost');
    }

    //  Hiding cost if permission false.
    if (!user.iam.inventory.view_cost) {
      this.tableConfigs.columnsConfig = this.tableConfigs.columnsConfig.filter(column => column.reference !== 'cost');
    }

    if (this._route.snapshot.queryParams.action == "add-inventory") {
      this.onButtonClick('add-inventory')
      return
    }

    // subscribe to params change in order to keep the url updated
    this._route.queryParams.subscribe(p => {
      if (!p.warehouse) {
        this._router.navigate(['inventory'], {queryParams: {warehouse: 'all'}})
        return
      }
      this.inventoryWarehouse = p.warehouse
      this.tableWrapper ? this.tableWrapper.ngOnInit() : null
      this.tableWrapper ? this.tableWrapper.refresh() : null
      this.fliproomList ? this.fliproomList.refresh() : null
    })
  }

  ionViewDidEnter() {
    // if in a tour, trigger next step which will focus the search bar
    if (this._route.snapshot.queryParams.tour == 'sell-item') {
      setTimeout(() => {
        this.tourService.startTour('sell-item', {page: 'inventory-view'})
      }, 300)

      //listen for button click and close tour
      const sub = this.tourService.tourHighlightClickObs.subscribe((data) => {
        if (data.action == "click" && data.stepId == "sell-items") {
          this.onButtonClick('add-inventory')
          this.tourService.completed()
          sub.unsubscribe()
        }
      })
    }
  }

  ionViewWillLeave() {
  }

  onRefresh() {
    this.tableWrapper ? this.tableWrapper.refresh() : null
    this.fliproomList ? this.fliproomList.refresh() : null
  }

  onDataRequest(evt: DataRequest): void {
    //get parameters from table
    if (this.inventoryWarehouse == "virtual"){ // show only own virtual
      evt.params['virtual'] = true
      evt.params['accountID'] = this.user.account.ID
    } else if (this.inventoryWarehouse == "incoming"){ // show only own stock in incoming and avoid virtual (since no location)
      evt.params['quantityIncoming'] = "1:"
      evt.params['virtual'] = false
      evt.params['warehouse.accountID'] = this.user.account.ID
    } else if (this.inventoryWarehouse == "external"){ // show only own stock to avoid fetch all database inventory (to see consingor stock use listings page)
      evt.params['accountID'] = this.user.account.ID
      evt.params['warehouse.accountID'] = `!${this.user.account.ID}`
    } else if (this.inventoryWarehouse == "all") {
      //this should show all the inventory
      //accountID:3 - (in stock & virtual) and external location
      //warehouseID - consignor at location and incoming consignor
      evt.params['or'] = `accountID=${this.user.account.ID}|warehouseID=${this.user.account.warehouses.map(wh => wh.ID).join(',')}`
    } else { // any own warehouse - don't filter by own stock because of consignment but by own warehouse instead
      const warehouseSelected = this.user.account.warehouses.find(wh => wh.name == this.inventoryWarehouse)
      evt.params['warehouseID'] = warehouseSelected.ID
    }

    if(environment.screenType == 'mobile'){
      evt.params['groupBy'] = ['inventory.productID']
    }
    this._api.getInventory(evt.pageIdx, evt.pageSize, evt.sort, evt.params).subscribe(resp => {
      this.dataRequested = resp
    })
  }

  onSegmentChanged(evt){
    this._router.navigate(['/inventory'], {queryParams: {warehouse: evt.detail.value}})
    this.onRefresh()
  }

  onOpenHelp() {
    this._modalCtrl.help('inventory').subscribe(() => {})
  }

  onButtonClick(buttonId: string) {


    if (buttonId == 'add-inventory') {

      let productSelected;

      this._modalCtrl.open(ProductSearchComponent, {consignment: this.user.account.externalSaleChannels.length > 0, redirectTo: 'inventory'}, {cssClass: 'full-screen-y'}).pipe(
        filter(product => product),
        mergeMap((product: Product) => {
          productSelected = product
          //check if account has virtual inventory available and prompt bulk-add option
          if(this.user.iam.inventory.virtual){
            return this._modalCtrl.actionSheet('Inventory Type', [
              {title: 'Physical', key: 'stock'},
              {title: 'Virtual', key: 'virtual'}
            ]).pipe(
              filter(res => res.role == "submit"),
              map(res => res.data)
            )
          } else {
            return of('stock')
          }

        })
      ).subscribe((inventoryType: string) => {
        const params = {
          formType: 'create',
          inventoryType: inventoryType
        }
        this._router.navigate([`inventory/bulk/create/product/${productSelected.ID}`], {queryParams: params})
      })
    }
  }

  onRowClick(inventoryRecord: InventoryRecord) {
    //check user permission
    if (!this.user.iam.inventory.view){
      this._modalCtrl.info('You have not been granted the permission to view inventory')
      return
    }

    const queryParams = {
      inventoryType: "stock",
      formType: "edit",
      inventoryRecordID: inventoryRecord.ID,
    }

    if (inventoryRecord.virtual) {
      queryParams.inventoryType = "virtual"
    } else if (inventoryRecord.accountID != this.user.account.ID) {
      queryParams.inventoryType = "consignment"
    }

    // if clicking on consignor inventory. Fetch account product. Otherwise it might create data inconsistencies if user adds inventory from consignor product
    this._api.getInventoryByID(inventoryRecord.ID).subscribe((_invRec: InventoryRecord) => {
      // if accessing own inventory, user inventory.variant. If accessing inventory belonging to consignor, get own variant from listings on your sale channels
      let variant =  _invRec.accountID == this.user.account.ID ? _invRec.variant : _invRec.listings.filter(listing => listing.saleChannel.accountID == this.user.account.ID)[0].variant
      //TODO: update this when bulk inventory is out of beta
      let url = `inventory/product/${variant.productID}`
      // Mobile: pass just product ID and then user can select the variants they want to view
      // Web: pass the variant ID too as a query param so variant on list can be pre-selected
      //TODO: remove this when bulk inventory is out of beta
      if(environment.screenType != 'mobile' ){
        url +=`/variants/${variant.ID}`
        if(this.user.iam.inventory.update) {
          queryParams['inventoryID'] = inventoryRecord.ID
        }
      }
      this._router.navigate([url], {queryParams})
    })
  }

  /**
   * Opening action sheet when adding inventory if user has access to bulk add inventory 'virtual' or 'stock'
   *
   * - used by users that have inventory.virtual permission
   */
  openBulkAddInventoryTypeOptions(product) {
    const actions = [
      {title: 'Physical', key: 'physical-inventory'},
      {title: 'Virtual', key: 'virtual-inventory'}
    ]
    this._modalCtrl.actionSheet('Inventory Type', actions).pipe(
      filter(res => res.role == "submit"),
      map(res => res.data)
    ).subscribe((action: string) => {
      switch (action) {
        case 'physical-inventory':
          this._router.navigate([`inventory/bulk/create/product/${product.ID}`], {queryParams: { formType: 'create', inventoryType: 'stock'}})
          break;
        case 'virtual-inventory':
          this._router.navigate([`inventory/bulk/create/product/${product.ID}`], {queryParams: { formType: 'create', inventoryType: 'virtual'}})
          break;

      }

    })
  }

  onInventoryOptionsClick(){
    const actions = []
    // Add actions
    if(this.user.iam.inventory.create){
      actions.push({icon: 'info', title: 'Add Inventory', description: '', disabled: false, key: 'add-inventory'})
    }

    this._modalCtrl.actionSheet('Actions', actions).pipe(
      filter((resp: IModalResponse) => resp.role == "submit"),
      map((resp: IModalResponse) => resp.data),
      ).subscribe((action: string) => {
        switch(action) {
          case 'add-inventory':
          this.onButtonClick('add-bulk-inventory')
          break;
        }
      })
  }

  get trackCost() {
    let untracked = localStorage.getItem('untrack-cost');
    if ( untracked == 'true') {
      return false;
    }
    return true;
  }



}
