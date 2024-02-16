import { SelectionChange } from '@angular/cdk/collections';
import { Component, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { of, Subscription } from 'rxjs';
import {filter, mergeMap} from 'rxjs/operators';
import { ApiService } from 'src/app/core/api.service';
import { ScannerResponse } from 'src/app/core/barcode-scanner.service';
import { PluginsService } from 'src/app/core/plugins.service';
import { UserService } from 'src/app/core/user.service';
import { ProductSearchComponent } from 'src/app/shared/components/product-search/product-search.component';
import { SelectItemComponent } from 'src/app/shared/components/select-item/select-item.component';
import { ModalService } from 'src/app/shared/modal/modal.service';
import { Item } from 'src/app/shared/models/Item.model';
import { Warehouse } from 'src/app/shared/models/Warehouse.model';
import { DataRequest, TableConfiguration, TableWrapperComponent } from 'src/app/shared/table-wrapper/table-wrapper.component';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-transfer-details',
  templateUrl: './transfer-details.component.html',
  styleUrls: ['./transfer-details.component.scss'],
})
export class TransferDetailsComponent implements OnInit {
  @Input()  selectedWarehouse: Warehouse
  @Input()  destinationWarehouse: Warehouse
  @Input()  transferDetailsList: Item[]
  @Output() onBack = new EventEmitter()
  @Output() onNext = new EventEmitter()
  @Output() transferDetailsListChange = new EventEmitter<Item[]>()

  @ViewChild('tableWrapper') tableWrapper: TableWrapperComponent;

  public environment = environment
  public dataRequested;
  private _activeSubs: Subscription[] = []

  public tableConfigs: TableConfiguration = new TableConfiguration({
    columnsConfig: [
      {reference: 'product.imageReference',      displayedName: 'Images',      dataType: 'string', disableFilter: true},
      {reference: 'ID',                            displayedName: 'ID',    dataType: 'string'},
      {reference: 'product.code',                displayedName: 'SKU',         dataType: 'string'},
      {reference: 'product.title',               displayedName: 'Product',     dataType: 'string'},
      {reference: 'variant.name',                displayedName: 'Variant',     dataType: 'string'},
      {reference: 'account.ID',                  displayedName: 'Account ID',  dataType: 'string'},
      {reference: 'account.name',                displayedName: 'Account',     dataType: 'string'},
      {reference: 'barcode',                     displayedName: 'Barcode',     dataType: 'string'},
      {reference: 'inventoryID',                 displayedName: 'Inventory ID',dataType: 'string'},
      {reference: 'status.name',                 displayedName: 'Status',      dataType: 'string', disableFilter: true},
    ],
    tableKey: 'items',
    rowSelectable: true,
    showAdvancedFilter: true,
    rowHoverable: false,
    emptyTablePlaceholder: 'No Items Available',
    dataSourceFnName: 'getItemsList' // pass this to allow table download
  })

  constructor(
    private _api: ApiService,
    private _modalCtrl: ModalService,
    public user: UserService,
    private _plugins: PluginsService
  ) { }

  ngOnInit() {
    const sub1 = this._plugins.scanner.scannerReadListener.subscribe((scannerResponse: ScannerResponse) => {
      if (scannerResponse.status == "error") {
        this._modalCtrl.error(scannerResponse.message)
        return
      }
      const barcode = scannerResponse.data

      // fetch all item that match the barcode scanned
      const params = {
        barcode: barcode,
        'warehouseID': this.selectedWarehouse.ID,
        statusID: '!*' // not in trasit or sold
      }

      this._api.getItemsList(0,99999, 'createdAt:desc', params).subscribe(response => {
        if (response.count == 0) {
          this._modalCtrl.warning(`No item found with barcode ${barcode}`)
          return
        }

        this._onItemSelected(response.data[0])
      })
    })

    this._activeSubs.push(sub1)
  }

  ngAfterViewInit() {
    // wait for table to be initialized to attach selection list change listener
    if (environment.screenType == 'desktop') {
      // restore items selected for table select
      this.transferDetailsList.map(item => this.tableWrapper.selector.select(item))

      this.tableWrapper.selector.changed.subscribe((change: SelectionChange<any>) => {
        this.forbiddenTransferItemsSelected(change.source.selected)
        // logic to prevent selection of items with no listings to external warehouse accounts
        this.transferDetailsListChange.emit(change.source.selected)
     })

    }
  }

  ionViewWillLeave(){
    this._activeSubs.map((sub: Subscription) => {
      sub.unsubscribe()
    })
  }

  onDataRequest(evt: DataRequest): void {
    evt.params['warehouseID'] = this.selectedWarehouse.ID
    evt.params['statusID'] = '!*' // not in trasit or sold

    this._api.getItemsList(evt.pageIdx, evt.pageSize, evt.sort, evt.params).subscribe(resp => {
      this.dataRequested = resp
    })
  }


  onScanBarcode() {
    this._plugins.scanner.setReadMode();
  }

  onSearchProduct() {
    this._modalCtrl.open(ProductSearchComponent).pipe(
      filter(product => product),
      mergeMap((product) => this._modalCtrl.open(SelectItemComponent, {product: product, warehouse: this.selectedWarehouse, disableSource: true})),
      filter(item => item)
    ).subscribe((item: Item) => this._onItemSelected(item))
  }

  _onItemSelected(item) {

    const alreadyInTheList = this.transferDetailsList.find(i => i.ID == item.ID)

    if (alreadyInTheList) {
      this._modalCtrl.warning('Item already added to the transfer')
      return
    }

    this.transferDetailsList.push(item)
  }

  onBackButtonClicked() {
    this.onBack.emit()
  }

  onNextButtonClicked() {
    if(this.transferDetailsList.length == 0){
      this._modalCtrl.warning('Please select at least one item to transfer');
      return
    }
    this.transferDetailsListChange.emit(this.transferDetailsList)
    this.onNext.emit()
  }

  //returns a list of items that are selected but forbidden to be used in transfer because of no external listings
  forbiddenTransferItemsSelected(items){
    const forbiddenItems =  items.filter(item => {
      //if item has sold skip as it is not affected
      if (!item.inventoryID){
        return false
      }
      return !(item.inventory.listings.find(listing => listing.saleChannel.accountID == this.destinationWarehouse.accountID))
    })

    if(forbiddenItems.length> 0){
      this._modalCtrl.confirm(`Can't transfer selected item to ${this.selectedWarehouse.name} because it is missing a listing for the their account, go to inventory for this item and create a listing for one of their sale channels.`).subscribe(()=> {
        this.tableWrapper.selector.deselect(forbiddenItems[0])
      })
    }
  }


}
