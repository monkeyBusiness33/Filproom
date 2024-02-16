import { Component, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin, of, Subscription} from 'rxjs';
import { filter, map, mergeMap} from 'rxjs/operators';
import { ApiService } from 'src/app/core/api.service';
import { ScannerResponse } from 'src/app/core/barcode-scanner.service';
import { PluginsService } from 'src/app/core/plugins.service';
import { UserService } from 'src/app/core/user.service';
import { FliproomListComponent } from 'src/app/shared/fliproom-list/fliproom-list.component';
import { IModalResponse, ModalService } from 'src/app/shared/modal/modal.service';
import { OrderLineItem } from 'src/app/shared/models/Order.model';
import { Warehouse } from 'src/app/shared/models/Warehouse.model';
import { DataRequest } from 'src/app/shared/table-wrapper/table-wrapper.component';

@Component({
  selector: 'app-inbound',
  templateUrl: './inbound.page.html',
  styleUrls: ['./inbound.page.scss'],
})
export class InboundPage implements OnInit {
  public selectedWarehouse: Warehouse;
  public isLoading: boolean = false;
  public orderLineItemSelected: OrderLineItem;
  public currentSelectedSegment: string = 'all'

  @ViewChild('fliproomList') fliproomList: FliproomListComponent;
  public dataRequested;

  private _activeSubs: Subscription[] = []

  constructor(
    public user: UserService,
    private _modalCtrl: ModalService,
    private _plugins: PluginsService,
    private _api: ApiService,
    private _router: Router
  ) { }

  ngOnInit() {
    if (localStorage.getItem('selected-warehouseID')) {
      this.selectedWarehouse = this.user.account.warehouses.find((wh: Warehouse) => wh.ID.toString() == localStorage.getItem('selected-warehouseID'))
    } else {
      this.selectedWarehouse = this.user.account.warehouses[0]
      localStorage.setItem('selected-warehouseID', this.selectedWarehouse.ID.toString())
    }
  }

  ionViewWillEnter() {
    const sub1 = this._plugins.scanner.scannerReadListener.subscribe((scannerResponse: ScannerResponse) => {
      if (scannerResponse.status == "error") {
        this._modalCtrl.error(scannerResponse.message)
        return
      }
      const barcode = scannerResponse.data
      this.isLoading = true

      // fetch all item that match the barcode scanned
      const params = {
        accountID: this.user.account.ID,
        status: 'fulfilling,dispatched,delivered',
        'fulfillment.status.name': 'transit', // need this to avoid to fetch oli of a fulfillment not yet scanned out since the oli have status fulfilling
        barcode: barcode,
        'fulfillment.destinationAddressID': this.selectedWarehouse.addressID,
        type:'transfer-in,inbound'
      }
      // clone params to remove barcode from fulfillment params
      const fulfillmentParams = JSON.parse(JSON.stringify(params))
      //remove barcode from fulfillment params
      delete fulfillmentParams.barcode
      fulfillmentParams['fulfillment.trackingNumber'] = barcode


      let requests = {
        oliRes: this._api.getOrderLineItems(0,99999, 'createdAt:desc', params),
        itemRes: this._api.getItemsList(0,99999, 'createdAt:desc', {barcode: barcode}),
        fulfillmentRes: this._api.getOrderLineItems(0,99999, 'createdAt:desc', fulfillmentParams),
      }

      forkJoin(requests).subscribe((response: any) => {
        const items = response.itemRes.data
        const multipleBarcodesFound = response.itemRes.data.length > 1
        const oliNotDelivered = response.oliRes.data.filter(oli => oli.status.name != "delivered")
        const oliDelivered = response.oliRes.data.filter(oli => oli.status.name == "delivered")
        const fulfillmentsByTrackingNumber = response.fulfillmentRes.data
        //warn users that there are multiple barcodes
        if (multipleBarcodesFound) {
          this._modalCtrl.confirm('This barcode is assigned to multiple items, please allocate a new barcode to item at hand')
          this.isLoading = false;
        }

        //Prevent duplication of barcodes
        else if ( items.length ==1 && this.orderLineItemSelected && this.orderLineItemSelected.item.ID != items[0]['ID']) {
          //adapt mesage if item found was deleted
          if(items[0]['deletedAt']){
            this._modalCtrl.warning('This barcode is allocated to another item that was deleted')
          }
          else{
            this._modalCtrl.warning('This barcode is allocated to another item')
          }
          this.isLoading = false;
        }
        else if (oliNotDelivered.length == 1) {
          this.onItemReception(oliNotDelivered[0])
        }
        else if (oliNotDelivered.length == 0 && oliDelivered.length > 0) {
          this._modalCtrl.warning('Item Already Scanned')
          this.isLoading = false;
        } else if (response.oliRes.data.length == 0 && this.orderLineItemSelected && this.orderLineItemSelected.item.barcode == null) {
          // no item with matching barcode && item selected has no barcode - meaning assign barcode
          this._api.updateItem(this.orderLineItemSelected.item.ID, {barcode: barcode}).subscribe(res => this.onItemReception(this.orderLineItemSelected))
        }
        // barcode scanned is linked to a fulfillment tracking number
        else if (fulfillmentsByTrackingNumber.length > 0) {
          this._modalCtrl.confirm('This barcode matches a fulfillment tracking number, would you like to show the items associated to this fulfillment?').subscribe((resp: IModalResponse) => {
           if (resp){
             this.dataRequested = response.fulfillmentRes
             this.isLoading = false;
           }
           else{
             this.handleBarcodeNotLinked()
           }
          })
        }
        else {
          this.handleBarcodeNotLinked()
        }
      })
    })

    this._activeSubs.push(sub1)
  }

  // Function to handle the scenario when the barcode is not linked
  handleBarcodeNotLinked() {
    this._modalCtrl.warning(`Barcode is not linked to any inbounding item`);
    this.isLoading = false;
  }

  ngAfterViewInit() {
    this.onRefresh()
  }

  ionViewWillLeave(){
    this._activeSubs.map((sub: Subscription) => {
      sub.unsubscribe()
    })
  }

  onRefresh() {
    this.fliproomList ? this.fliproomList.refresh() : null
  }

  onWarehouseSelected(warehouse: Warehouse) {
    if (this.selectedWarehouse && this.selectedWarehouse.ID == warehouse.ID) {
      this._modalCtrl.info(`Warehouse already selected`)
      return
    }

    this.selectedWarehouse = warehouse
    localStorage.setItem('selected-warehouseID', warehouse.ID.toString())
    this.onRefresh()
  }

  onDataRequest(evt: DataRequest): void {
    let params = {
      accountID: this.user.account.ID,
      status: 'fulfilling,dispatched',
      'fulfillment.status.name': 'transit', // need this to avoid to fetch oli of a fulfillment not yet scanned out since the oli have status fulfilling
      'fulfillment.destinationAddressID': this.selectedWarehouse.addressID,
      type:'transfer-in,inbound'
    }

    if(this.currentSelectedSegment == 'sold'){
      params['item.inventoryID'] = '!*'
    } else if (this.currentSelectedSegment == 'stock') {
      params['item.inventoryID'] = '*'
    } else if (this.currentSelectedSegment == 'transfer') {
      params['type'] = 'transfer-in'
    }

    if (evt.params.search) {
      params['search'] = evt.params.search
    }

    this._api.getOrderLineItems(evt.pageIdx, evt.pageSize, evt.sort, params).subscribe((resp) => {
      this.dataRequested = resp;
      this.isLoading = false;
    });
  }

  onSegmentChanged(evt){
    this.currentSelectedSegment = evt.detail.value
    this._router.navigate(['/warehousing/inbound'], {queryParams: {type: this.currentSelectedSegment}})
    this.onRefresh()
  }

  onItemSelected(orderLineItem: OrderLineItem) {
    /**
     * Called on items in the list clicked
     */

    // if already selected - deselect
    if (this.orderLineItemSelected && this.orderLineItemSelected.ID == orderLineItem.ID) {
      this.orderLineItemSelected = null
    } else {
      this.orderLineItemSelected = orderLineItem
      this.onBarcodeStart()
    }
  }

  /**
   * Recieves orderLineItem to check in
   * Update orderLineItem
   * @param orderLineItem
   */
  onItemReception(orderLineItem: OrderLineItem){
    this._api.fulfillmentDeliver(orderLineItem.orderID, orderLineItem.fulfillmentID, [{ID: orderLineItem.ID}]).subscribe(res =>  {
      this.orderLineItemSelected = null // return to read mode
      this._modalCtrl.success('Ok')

      this.onRefresh()
    })
  }

  onBarcodeStart() {
    this._plugins.scanner.setReadMode();
  }

  onWarehouseSelection() {
    const warehouses = []
    this.user.account.warehouses.map((wh: Warehouse) => warehouses.push({
      title: wh.name,
      key: wh.ID
    }))
    this._modalCtrl.actionSheet('Warehouses', warehouses).pipe(
      filter((resp: IModalResponse) => resp.role == "submit"),
      map((resp: IModalResponse) => resp.data)
    ).subscribe((warehouseID: number) => {
      this.onWarehouseSelected(this.user.account.warehouses.find((wh) => wh.ID == warehouseID))
    })
  }
}
