import {Component, Input, OnInit} from '@angular/core';
import {Order, OrderLineItem} from "../../../shared/models/Order.model";
import { environment } from 'src/environments/environment';
import {ApiService} from "../../../core/api.service";
import {ActivatedRoute, Router} from "@angular/router";
import {ModalService} from "../../../shared/modal/modal.service";


@Component({
  selector: 'app-items-summary',
  templateUrl: './items-summary.component.html',
  styleUrls: ['./items-summary.component.scss'],
})
export class ItemsSummaryComponent implements OnInit {

  @Input() order: Order;
  @Input() orderMode: string;

  public environment = environment;
  constructor(
    private _api: ApiService,
    private _route: ActivatedRoute,
    private _modalCtrl: ModalService,
    private _router: Router,
  ) { }

  ngOnInit() {

  }

  getVisibleOrderLineItems(order: Order) {
    //remove order line items that have status.name deleted and have replacePending = false

    return order.orderLineItems.filter((lineItem) =>
        lineItem.status.name != 'deleted' || lineItem.replacePending
    )
  }

  /**
   * Get order totals
   */

  get orderTotals() {
    //TODO: calculate totals
    const saleTransaction = this.order.transactions.find((transaction) => transaction.type == 'sale')
    const shippingTransaction = this.order.transactions.find((transaction) => transaction.type == 'shipping')
    const subtotal = saleTransaction? saleTransaction.grossAmount: 0
    const shipping =  shippingTransaction? shippingTransaction.grossAmount:0
    const total = this.order.totalAmount || 0
    return {subtotal, shipping, total}

  }

}
