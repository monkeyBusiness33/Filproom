import { Location } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, Subscription } from 'rxjs';
import { filter, map, mergeMap } from 'rxjs/operators';
import { ApiService } from 'src/app/core/api.service';
import { ScannerResponse } from 'src/app/core/barcode-scanner.service';
import { PluginsService } from 'src/app/core/plugins.service';
import { UserService } from 'src/app/core/user.service';
import { ModalService } from 'src/app/shared/modal/modal.service';
import { Address } from 'src/app/shared/models/Address.model';
import { Fulfillment } from 'src/app/shared/models/Fulfillment.model';
import { Order, OrderLineItem } from 'src/app/shared/models/Order.model';
import { FulfillmentFormComponent } from '../modals/fulfillment-form/fulfillment-form.component';
import {AddressContactPage} from "../modals/address-contact/address-contact.page";

@Component({
  selector: 'app-fulfillment',
  templateUrl: './fulfillment.page.html',
  styleUrls: ['./fulfillment.page.scss'],
})
export class FulfillmentPage implements OnInit {
  /**
   * Display Items grouped by status instead of location
   * don't use location because items might get sold later resulting without location when actually they have been inbounded in the fulfillment
   * So instead of using location, we can use dispatchedAt and deliveredAt.
   * Based on the state of dispatchedAt and deliveredAt, the items are assigned to one of the 3 groups:
   *
   * to fulfill @ warehouseName (n/tot) - !dispatchedAt
   * transit - dispatchedAt && !deliveredAt
   * delivered  @ warehouseName (n/tot) - deliveredAt
   *
   *
   * When an item is clicked/scanned
   * the type of fulfillment (inbound,outbound or transfer) and the item's group (to fulfill, transit or delivered)
   * determines the logic to apply to the action
   *
   * inbound fulfillment
   * - to fulfill - can't happen - or yes with consignor sale????? TO CHECK
   * - transit    - set as delivered (assign barcode, scan barcode or set as delivred)
   * - delivered  - do nothing
   *
   * outbound fulfillment
   * - to fulfill - set as dispatched (scan barcode and set as dispatched)
   * - transit    - set as delivered
   * - delivered  - do nothing
   *
   * transfer
   * - to fulfill - set as dispatched (scan barcode and set as dispatched)
   * - transit    - set as delivered  (assign barcode, scan barcode and set as delivered)
   * - delivered  - do nothing
   *
   *
   */

  public isLoading : boolean = false;
  public order: Order; // store the order where the fulfillment is coming from
  public fulfillmentType: string= '' // used to inform the user what type of fulfillment is this: inbound, outbound or (internal) transfer
  public fulfillment: Fulfillment;
  public uniqueOrderLineItems: OrderLineItem[] = [] //avoid display double olis - display olis of the order selected in the URL orders/:orderID
  public itemsByLocation = {} // this object is used to group, sort and display the information for the user
  public barcodingAvailable: boolean = true; // true if allow barcode scanning

  public orderLineItemSelected: OrderLineItem;
  public activeSubs: Subscription[] = []

  constructor(
    private _route: ActivatedRoute,
    private _location: Location,
    private _api: ApiService,
    private _plugins: PluginsService,
    private _modalCtrl: ModalService,
    public user: UserService,
    private _router: Router
  ) { }

  ngOnInit(): void {
    this._route.params.subscribe((params) => this._onRefresh());
  }

  ionViewWillEnter() {
    // subscribe to barcode scan
    let barcodeAlreadyAssigned; // used to avoid to assign a barcode already in use
    let barcode; // let barcode being accessed later
    const sub1 = this._plugins.scanner.scannerReadListener.pipe(
      mergeMap((scannerResponse: ScannerResponse) => {
        barcode = scannerResponse.data.toLowerCase().trim()
        return this._api.getItemsList(0, 10, null, {barcode: barcode})
      }),
    ).subscribe(response => {
      barcodeAlreadyAssigned = response.count != 0

      // check if barcode scanned matched item in order - if not but an order line item is selected, use it as matched item
      console.log(this.uniqueOrderLineItems.find(orderItem => orderItem.item.barcode == barcode) )
      const matchedItem = this.uniqueOrderLineItems.find(orderItem => orderItem.item.barcode == barcode) || this.orderLineItemSelected

      if (!matchedItem) {
        this._modalCtrl.warning('Barcode does not match any item in this fulfillment')
        return
      }

      // notify user if outbounding and item already scanned
      if(matchedItem && this.fulfillmentType == 'outbound' && matchedItem.dispatchedAt != null) {
        this._modalCtrl.warning('Item already scanned')
        return
      }

      // notify user if inbounding and item already scanned
      if(matchedItem && this.fulfillmentType == 'inbound' && matchedItem.deliveredAt != null) {
        this._modalCtrl.warning('Item already scanned')
        return
      }

      if(matchedItem && !matchedItem.item.barcode && barcodeAlreadyAssigned) {
        this._modalCtrl.warning('Barcode Already is use by another items')
        return
      }

      if (matchedItem) {
        this.isLoading = true

        const queries = []
        if (!matchedItem.item.barcode) {
          queries.push(this._api.updateItem(matchedItem.itemID, {barcode: barcode}))
        }
        if ((this.fulfillmentType == 'outbound' || this.fulfillmentType == 'transfer') && matchedItem.canDispatch().value) {
          queries.push(this._api.fulfillmentDispatch(this.order.ID, this.fulfillment.ID, [{ID: matchedItem.ID}]))
        } else if (matchedItem.canDeliver().value) {
          queries.push(this._api.fulfillmentDeliver(this.order.ID, this.fulfillment.ID, [{ID: matchedItem.ID}]))
        }

        forkJoin(queries).subscribe(res => {
          this._modalCtrl.success('Ok')
          this._onRefresh()

          //Auto close fulfillment logic after scanning
          let oliLeftToScan = []
          if (this.fulfillmentType == 'inbound') {
            oliLeftToScan = this.uniqueOrderLineItems.filter(oli => !oli.deliveredAt && oli.ID != matchedItem.ID)
          } else if (this.fulfillmentType == 'outbound') {
            oliLeftToScan = this.uniqueOrderLineItems.filter(oli => !oli.dispatchedAt && oli.ID != matchedItem.ID)
          } else (
            oliLeftToScan = this.uniqueOrderLineItems.filter(oli => (!oli.dispatchedAt || !oli.deliveredAt) && oli.ID != matchedItem.ID)
          )

          if (oliLeftToScan.length == 0) {
            this._modalCtrl.confirm(`Fulfillment complete, go back?`).pipe(
              filter(res => res)
            ).subscribe((res) => this._location.back())
          }

        })
      }
    })

    this.activeSubs.push(sub1)
  }

  ionViewWillLeave() {
    this.activeSubs.map(sub => sub.unsubscribe())
  }

  private _onRefresh() {
    this.isLoading = true;
    this._api.getFulfillmentByID(parseInt(this._route.snapshot.paramMap.get('orderID')), parseInt(this._route.snapshot.paramMap.get('fulfillmentID')))
      .subscribe((fulfillment: Fulfillment) => {
        this.fulfillment = fulfillment;
        // determine type of fulfillment
        if (fulfillment.inboundOrder && fulfillment.inboundOrder.accountID == this.user.account.ID && fulfillment.outboundOrder && fulfillment.outboundOrder.accountID == this.user.account.ID) {
          this.fulfillmentType = 'transfer'
        } else if (fulfillment.inboundOrder && fulfillment.inboundOrder.accountID == this.user.account.ID) {
          this.fulfillmentType = 'inbound'
        } else {
          this.fulfillmentType = 'outbound'
        }

        this.order = (fulfillment.inboundOrder && fulfillment.inboundOrder.ID == parseInt(this._route.snapshot.paramMap.get('orderID'))) ? fulfillment.inboundOrder : fulfillment.outboundOrder

        this.itemsByLocation = {
          'origin': {
            title: `to fulfill @ ${fulfillment.origin.fullName || 'n/a'}`,
            items: []
          },
          'transit': {
            title: 'transit',
            items: []
          },
          'destination': {
            title: `delivered @ ${fulfillment.destination.fullName || 'n/a'}`
          }
        }
        //patch fulfillment on olis without having to nest in the api response
        this.fulfillment.orderLineItems.map(oli => oli.fulfillment = this.fulfillment)
        // to avoid display double olis - display olis of the order selected in the URL orders/:orderID
        this.uniqueOrderLineItems = this.fulfillment.orderLineItems.filter((oli: OrderLineItem) => oli.orderID == this.order.ID)

        // determine if items should be put in the 'at origin location list' or in the 'transit list'
        this.itemsByLocation['origin'].items      = this.uniqueOrderLineItems.filter((oli: OrderLineItem) => !oli.dispatchedAt && !oli.deliveredAt)
        this.itemsByLocation['transit'].items     = this.uniqueOrderLineItems.filter((oli: OrderLineItem) =>  oli.dispatchedAt && !oli.deliveredAt)
        this.itemsByLocation['destination'].items = this.uniqueOrderLineItems.filter((oli: OrderLineItem) =>  oli.deliveredAt)

        // disable barcode scanning if fulfillment if completed (handles scenario for each type of fulfillment)
        if (
          (this.fulfillmentType == 'outbound' && this.itemsByLocation['origin'].items.length == 0) || // all scanned outbound
          (this.fulfillmentType == 'inbound' && (this.itemsByLocation['origin'].items.length == 0 && this.itemsByLocation['transit'].items.length == 0)) || // all scanned inbound
          (this.fulfillmentType == 'transfer' && this.uniqueOrderLineItems.length == this.itemsByLocation['destination'].items.length) ||// all scanned inbound
          !this.user.iam.service.warehousing
        ) {
          this.barcodingAvailable = false
        }

        if (this._route.snapshot.queryParams.action == 'show-label') {
          this._api.getFulfillmentShippingLabel(this.order.ID, fulfillment.ID).subscribe(res => {
            this._plugins.printPDF(
              res['base64ShippingLabel'],
              `shipping-label_${fulfillment.ID}.pdf`
            )
          })
        }

        this.isLoading = false;
      });
  }

  onOpenOrder() {
    this._router.navigate([`orders/${this.order.ID}`])
  }

  onEditFulfillment() {
    this._modalCtrl.open(FulfillmentFormComponent, {orderID: (this.fulfillmentType == 'inbound' ? this.fulfillment.inboundOrder : this.fulfillment.outboundOrder).ID, fulfillment: this.fulfillment}, {cssClass: 'full-screen-y'}).pipe(
      filter(data => data)
    ).subscribe(res => {
      this._modalCtrl.success('Fulfillment Updated')
      this._onRefresh()
    })
  }

  public onPrintShippingLabel() {
    this._api.getFulfillmentShippingLabel(this.order.ID, this.fulfillment.ID).subscribe(res => {
      console.log(res)
      //this._plugins.printPDF(this.user.getStorageUrl(this.fulfillment.shippingLabelFilename))
      this._plugins.printPDF(res['base64ShippingLabel'])

    })
  }

  public onBarcodeStart() {
    this._plugins.scanner.setReadMode();
  }

  public onOrderLineItemSelected(orderLineItem: OrderLineItem) {
    this._api.getOrderLineItemByID(orderLineItem.ID).subscribe(oli => {
      orderLineItem = oli
      // Allow to select item if it doesn't have barcode - since it is the only way for the item to get selected
      if (!orderLineItem.item.barcode) {
        // toggle behaviour
        this.orderLineItemSelected = (this.orderLineItemSelected && this.orderLineItemSelected.ID == orderLineItem.ID) ? null : orderLineItem
      }

      // if service barcoding and item can be scanned
      if (this.user.iam.service.warehousing && (orderLineItem.canDispatch().value || orderLineItem.canDeliver().value) && this.barcodingAvailable) {
        // add scan open
        this._plugins.scanner.setReadMode();
      }
    })
  }

  onAddOriginOrDestination() {

  }

  onEditOriginOrDestination(address: Address) {
    this._modalCtrl.open(AddressContactPage, {address: address, formOnly:true}).pipe(
      filter(data => data)
    ).subscribe(res => {
      this._modalCtrl.success('Updated')
      this._onRefresh()
    })
  }
}
