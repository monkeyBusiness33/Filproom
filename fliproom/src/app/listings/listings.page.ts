import { Component, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { of, Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ApiService } from '../core/api.service';
import { UserService } from '../core/user.service';
import { FliproomListComponent } from '../shared/fliproom-list/fliproom-list.component';
import { ModalService } from '../shared/modal/modal.service';
import { InventoryListing } from '../shared/models/InventoryRecord';
import { Product, ProductVariant } from '../shared/models/Product.model';
import { DataRequest, TableConfiguration, TableWrapperComponent } from '../shared/table-wrapper/table-wrapper.component';
import { filter, map } from 'rxjs/operators';
import { ProductSearchComponent } from '../shared/components/product-search/product-search.component';

@Component({
  selector: 'app-listings',
  templateUrl: './listings.page.html',
  styleUrls: ['./listings.page.scss'],
  encapsulation: ViewEncapsulation.None
})
export class ListingsPage implements OnInit {
  @ViewChild('tableWrapper') tableWrapper: TableWrapperComponent;
  @ViewChild('fliproomList') fliproomList: FliproomListComponent;

  public environment = environment
  public saleChannel: string;
  public dataRequested;
  public tabs = this.user.account.saleChannels.map(sc => sc.title)

  public tableConfigs: TableConfiguration = new TableConfiguration({
    columnsConfig: [
      { reference: 'product.imageReference', displayedName: 'Images', dataType: 'string', disableFilter: true },
      { reference: 'product.code', displayedName: 'SKU', dataType: 'string' },
      { reference: 'product.title', displayedName: 'Product', dataType: 'string' },
      { reference: 'variant.name', displayedName: 'Variant', dataType: 'string' },
      { reference: 'account.name', displayedName: 'Account', dataType: 'string' },
      { reference: 'inventory.quantity', displayedName: 'Total QTY', dataType: 'number' },
      { reference: 'inventory.quantityAtHand', displayedName: 'Location QTY', dataType: 'number' },
      { reference: 'inventory.quantityIncoming', displayedName: 'Incoming QTY', dataType: 'number' },
      { reference: 'inventory.notes', displayedName: 'Notes', dataType: 'string' },
      { reference: 'accountID', displayedName: 'AccountID', dataType: 'string' },
      { reference: 'inventory.warehouse.name', displayedName: 'Inventory Location', dataType: 'string' },
      { reference: 'inventory.cost', displayedName: 'Cost', dataType: 'number' },
      { reference: 'payout', displayedName: 'Payout', dataType: 'number' },
      { reference: 'price', displayedName: 'Listing Price', dataType: 'number' },
      { reference: 'isActiveListing', displayedName: 'Best Price', dataType: 'string', disableFilter: true },
      { reference: 'marketOracle', displayedName: 'Market Oracle', dataType: 'string' },
      { reference: 'status', displayedName: 'Status', dataType: 'string' }
    ],
    tableKey: 'listings',
    showColumnsSelection: true,
    rowHoverable: true,
    showAdvancedFilter: true,
    emptyTablePlaceholder: 'No Listings Available',
    dataSourceFnName: 'getInventoryListings', // pass this to allow table download
  })
  

  constructor(
    public user: UserService,
    private _route: ActivatedRoute,
    private _router: Router,
    private _api: ApiService,
    private _modalCtrl: ModalService
  ) { }

  ngOnInit() {
    this._route.queryParams.subscribe(p => {

      if (!this.user.iam.inventory.view_cost) {
        this.tableConfigs.columnsConfig = this.tableConfigs.columnsConfig.filter(column => column.reference !== 'inventory.cost');
      }

      if (!p.saleChannel) {
        this._router.navigate(['listings'], {queryParams: {saleChannel: this.tabs[0]}})
        return
      }
      this.saleChannel = p.saleChannel
      this.tableWrapper ? this.tableWrapper.ngOnInit() : null
      this.tableWrapper ? this.tableWrapper.refresh() : null
      this.fliproomList ? this.fliproomList.refresh() : null
    })
  }

  onRefresh() {
    this.tableWrapper ? this.tableWrapper.refresh() : null
    this.fliproomList ? this.fliproomList.refresh() : null
  }

  onSegmentChanged(evt){
    this._router.navigate(['/listings'], {queryParams: {saleChannel: evt.detail.value}})
    this.onRefresh()
  }

  onOpenHelp() {
    this._modalCtrl.help('inventory').subscribe(() => {})
  }

  onDataRequest(evt: DataRequest): void {
    //get parameters from table
    const saleChannelSelected = this.user.account.saleChannels.find(sc => sc.title == this.saleChannel)
    evt.params['saleChannelID'] = saleChannelSelected.ID
    evt.params['inventory.quantity'] = '1:'

    // if external sale channel allow to see only self lsitings
    if (saleChannelSelected.accountID != this.user.account.ID) {
      evt.params['accountID'] = this.user.account.ID
    }

    if (evt.params['marketOracle']) {
      evt.params['priceSourceName'] = evt.params['marketOracle']
      delete evt.params['marketOracle']
    }

    if (evt.sort && evt.sort.includes('marketOracle')) {
      evt.sort = evt.sort.replace('marketOracle', 'priceSourceName')
    }

    this._api.getInventoryListings(evt.pageIdx, evt.pageSize, evt.sort, evt.params).subscribe(resp => {
      this.dataRequested = resp
    })
  }

  onRowClick(inventoryListingRecord: InventoryListing) {
    //check user permission
    if (!this.user.iam.inventory.update){
      this._modalCtrl.info('You have not been granted the permission to edit inventory')
      return
    }

    let inventoryType = "stock"
    if (inventoryListingRecord.inventory.virtual) {
      inventoryType = "virtual"
    } else if (inventoryListingRecord.accountID != this.user.account.ID) {
      inventoryType = "consignment"
    }

    const queryParams = {
      inventoryType: inventoryType,
      inventoryID: inventoryListingRecord.inventory.ID
    }
    let productID = inventoryListingRecord.inventory.productID
    let productVariantID = inventoryListingRecord.inventory.productVariantID

    //select correct product ID and variant ID based on user logged it
    if(this.user.account.ID != inventoryListingRecord.inventory.accountID){
      productID = inventoryListingRecord.productID
      productVariantID = inventoryListingRecord.productVariantID
    }
    //If clicking on consigned listing. Fetch account product. Otherwise it might create data inconsistencies if user adds inventory from consigned product
    let url = `inventory/product/${productID}/variants/${productVariantID}`
    this._router.navigate([url],  {queryParams})
  }

  onButtonClick(buttonId: string) {
    if (buttonId == 'add-inventory') {
      this._modalCtrl.open(ProductSearchComponent, {consignment: this.user.account.externalSaleChannelAccountIDs.length > 0, redirectTo: 'inventory'}, {cssClass: 'full-screen-y'}).pipe(
        filter(product => product),
      ).subscribe((product: Product) => {
        //check if account has virtual inventory available and prompt bulk-add option
        if(this.user.iam.inventory.virtual){
          this.openBulkAddInventoryTypeOptions(product)
        }
        else {
          this._router.navigate([`inventory/bulk/create/product/${product.ID}`], {queryParams: { formType: 'create', inventoryType: 'stock' }})
        }
      })
    }
  }

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

}
