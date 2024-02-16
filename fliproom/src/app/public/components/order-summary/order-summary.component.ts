import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {ApiService} from "../../../core/api.service";
import {ActivatedRoute, Router} from "@angular/router";
import {ModalService} from "../../../shared/modal/modal.service";
import {Order} from "../../../shared/models/Order.model";
import { environment } from 'src/environments/environment';
import {AddressContactPage} from "../../../orders/modals/address-contact/address-contact.page";
import {Address} from "../../../shared/models/Address.model";
import {mergeMap, switchMap} from "rxjs/operators";
import {from, of} from "rxjs";
import {loadStripe, Stripe, StripeElements} from "@stripe/stripe-js";
import {CheckoutContainerComponent} from "../checkout-container/checkout-container.component";
import {InputComponent} from "../../../shared/modal/input/input.component";
import {Step} from "../../../shared/components/steps/steps.component";




@Component({
  selector: 'app-order-summary',
  templateUrl: './order-summary.component.html',
  styleUrls: ['./order-summary.component.scss'],
})
export class OrderSummaryComponent implements OnInit {

  @Input() order: Order;
  @Input() orderMode: string;
  @Input() guestJWT: string;

  @Output() refreshDataEvent = new EventEmitter();


  private stripe: Stripe | null = null;

  public environment = environment;
  public displayMode: string ; // 'view' | 'checkout'

  constructor(
    private _api: ApiService,
    private _route: ActivatedRoute,
    private _modalCtrl: ModalService,
    private _router: Router
  ) {}

  ngOnInit() {

  }

  /**
   * Redirect to checkout
   *
   * When the user clicks on the checkout button, we open the checkout modal and pass the order and guestJWT to it.
   * The checkout modal will then create a checkout session and embed the checkout form in the modal.
   */
  redirectToCheckout() {
    console.log(this.order.consigneeID)
    if(this.order.consigneeID == null || this.order.consigneeID == undefined){
      this._modalCtrl.warning('Please add a shipping address before proceeding')
      return
    }

    this._modalCtrl.open(CheckoutContainerComponent, {order: this.order, guestJWT:this.guestJWT},{cssClass:"full-screen-y"}).subscribe(res => {
    })
  }

  /**
   * Generate Customer Order Statuses
   *
   * @structure {
   *   value: string,
   *   label: string,
   *   subLabel: string,
   *   completed: boolean,
   * }
   *
   * @description Adapt the statuses that the customer can see based on the actual order status by mapping the values
   */
  getCustomerOrderStatuses() {
    //set default steps
    const customerOrderStatuses: Step[] = [
      {value: 'paid', label: 'Paid', subLabel: 'Your order has been paid', additionalSubLabel: null, stepStatus: 'processing', color: null},
      {value: 'dispatched', label: 'Dispatched', subLabel: 'Order authenticated and shipped', additionalSubLabel: null, stepStatus: 'pending', color: null},
      {value: 'delivered', label: 'Delivered', subLabel: 'Order has been delivered', additionalSubLabel: null, stepStatus: 'pending', color: null},
    ]
    //Payment status
    //sale status = paid
    const saleTransaction = this.order.transactions.find(transaction => transaction.type == 'sale')



    if (saleTransaction && (saleTransaction.status == 'paid' || saleTransaction.status == 'processing')) {
      //find step and set status to completed
      const stepIndex =customerOrderStatuses.findIndex(step => step.value == 'paid')
     customerOrderStatuses[stepIndex].stepStatus = 'completed'
     customerOrderStatuses[stepIndex].color = 'success'
    }

    //Dispatch status
    //dispatched status = 13 (dispatched) or 8 (delivered)
    if(this.order.status.name == 'dispatched' || this.order.status.name == 'delivered'){
      //find step and set status to completed
     const stepIndex =customerOrderStatuses.findIndex(step => step.value == 'dispatched')
     const trackingNumbers = this.order.fulfillments
        .map(item => item.trackingNumber)
        .filter(trackingNumber => trackingNumber !== null && trackingNumber !== undefined);
     const uniqueTrackingNumbers = Array.from(new Set(trackingNumbers));
     customerOrderStatuses[stepIndex].additionalSubLabel = uniqueTrackingNumbers.length > 0 ? uniqueTrackingNumbers.join(',') : null;
     customerOrderStatuses[stepIndex].stepStatus = 'completed'
     customerOrderStatuses[stepIndex].color = 'success'
    }

    //Delivered status
    //delivered status = 8 (delivered)
    if(this.order.status.name == 'delivered'){
      //find step and set status to completed
      const stepIndex =customerOrderStatuses.findIndex(step => step.value == 'delivered')
     customerOrderStatuses[stepIndex].stepStatus = 'completed'
     customerOrderStatuses[stepIndex].color = 'success'
    }

    return customerOrderStatuses
  }

  onEditCustomer() {
    this._modalCtrl.open(AddressContactPage, {address: this.order.consignee, bypassBackendRequest:true, formOnly:true,guestJWT: this.guestJWT}, {cssClass: 'basic-theme'}).subscribe((customer: Address) => {
      let addressCreated = false
      if(customer){
        if (customer.ID) {
          this._api.updateAddress(customer.ID, customer, this.guestJWT).subscribe((address: Address) => {
            this._modalCtrl.success('Address updated')
            this.order.consignee = address
          })
        }
        // create
        else {
          const body = customer
          body['accountID'] = this.order.account.ID
          this._api.createAddress(body, this.guestJWT).pipe((
            switchMap((address: Address) => {
              addressCreated = true
              return this._api.updateOrder(this.order.ID, {consigneeID: address.ID}, this.guestJWT)
            })
          )).subscribe((order: Order) => {
            this._modalCtrl.success('Address updated')
            this.order = order
            this.refreshDataEvent.emit()
          })
        }
      }
    })
  }


  onEditNotes() {
    let currentNotes = this.order.notes ? this.order.notes : null
    this._modalCtrl.input({
      title: 'Order Notes',
      subtitle:'Any notes you want to add to your order',
      type: 'string',
      input: this.order.notes,
      fieldPlaceholder: null,
      fieldLabel: 'Notes'
    }, {cssClass: 'basic-theme'}).subscribe((notes) => {
      if ( notes != currentNotes) {
        this._api.updateOrder(this.order.ID, {notes:notes},this.guestJWT ).subscribe(res => {
          this.order= res
          this._modalCtrl.success('Notes updated')
        })
      }
    })
  }




  navigateToLanding() {
    //open landing page: https://www.fliproom.io/ in a new tab
    window.open('https://www.fliproom.io/', '_blank');
  }
}
