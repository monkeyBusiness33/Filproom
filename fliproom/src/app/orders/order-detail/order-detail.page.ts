import { Component, OnInit } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { ActivatedRoute, Router } from '@angular/router';
import { filter, map, mergeMap } from 'rxjs/operators';
import { ApiService } from 'src/app/core/api.service';
import { UserService } from 'src/app/core/user.service';
import { Transaction } from 'src/app/shared/models/Transaction.model';
import { Item } from 'src/app/shared/models/Item.model';
import { Order, OrderLineItem } from 'src/app/shared/models/Order.model';
import { IModalResponse, ModalService } from 'src/app/shared/modal/modal.service';
import { environment } from 'src/environments/environment';
import { OrdersListComponent } from '../modals/orders-list/orders-list.component';
import { InputResponse } from 'src/app/shared/modal/input/input.component';
import { CancelOrderComponent, OrderCancelRequest } from '../modals/cancel-order/cancel-order.component';
import { FulfillmentFormComponent } from '../modals/fulfillment-form/fulfillment-form.component';
import { forkJoin, of } from 'rxjs';
import { Address } from 'src/app/shared/models/Address.model';
import { SelectItemComponent } from 'src/app/shared/components/select-item/select-item.component';
import { PluginsService } from 'src/app/core/plugins.service';
import { AddressContactPage } from "../modals/address-contact/address-contact.page";
import { Fulfillment } from 'src/app/shared/models/Fulfillment.model';
import { PayoutFormComponent } from 'src/app/payments/modals/payout-form/payout-form.component';
import { TransactionFormComponent } from 'src/app/payments/modals/transaction-form/transaction-form.component';
import * as moment from 'moment';

@Component({
  selector: 'app-order-detail',
  templateUrl: './order-detail.page.html',
  styleUrls: ['./order-detail.page.scss'],
})
export class OrderDetailPage implements OnInit {
  public isLoading: boolean = false;
  public environment = environment
  public order: Order;
  public buttons = []
  public dataSource: MatTableDataSource<OrderLineItem> = new MatTableDataSource();
  public displayedColumns: string[] = [];
  private orderLineItemsToTransfer: OrderLineItem[] = [] //store order line items that needs to be transferred

  public transactionsDataSource: MatTableDataSource<Transaction> = new MatTableDataSource();
  public transactionsDataSourceColumns: string[] = []

  constructor(
    private _api: ApiService,
    private _route: ActivatedRoute,
    private _modalCtrl: ModalService,
    private _router: Router,
    private _plugins: PluginsService,
    public user: UserService
  ) { }

  ngOnInit(): void {
    this._route.params.subscribe((params) => this._onRefresh());
  }

  private _onRefresh() {
    this.isLoading = true;
    forkJoin({
      order: this._api.getOrderByID(parseInt(this._route.snapshot.paramMap.get('orderID'))),
      transactions: this._api.getOrderTransactions(parseInt(this._route.snapshot.paramMap.get('orderID')))
    })
      .subscribe((resp) => {
        this.order = resp.order as Order
        this.transactionsDataSource.data = resp.transactions as Transaction[]

        if (this.order.parentOrderID != null) {
          this.displayedColumns = ['image', 'product.title', 'product.code', 'productVariant.name', 'price', 'fees', 'payout', 'cost', 'profit', 'warehouse.name', 'status.name']
        } else {
          this.displayedColumns = ['image', 'account.name', 'account.ID', 'product.title', 'product.code', 'productVariant.name', 'price', 'cost', 'profit', 'warehouse.name', 'status.name']
        }

        //  Remove cost and profit if permission false
        if (!this.user.iam.inventory.view_cost) {
          let positionCost = this.displayedColumns.indexOf('cost')
          this.displayedColumns.splice(positionCost, 1)
          let positionProfit = this.displayedColumns.indexOf('profit')
          this.displayedColumns.splice(positionProfit, 1)
        }

        // Adding the new icon to the displayedColumns array
        this.displayedColumns.push('iconColumn');

        this.transactionsDataSourceColumns = ['amount', 'feesAmount', 'type']

        // Display transaction details dependig on type of order (consignment or not)
        if (this.order.parentOrderID) {
          this.transactionsDataSourceColumns.push('fromAccount.name')
        } else {
          this.transactionsDataSourceColumns.push('toAccount.name')
        }

        this.transactionsDataSourceColumns = this.transactionsDataSourceColumns.concat(['status', 'details'])

        //add available buttons
        this.buttons = []
        const itemsAvailableToBeFulfilled = this.order.orderLineItems.find(oli => oli.canFulfill().value)
        if (itemsAvailableToBeFulfilled) {
          this.buttons.push({ label: 'Ship Items', icon: 'add', id: 'create-fulfillment' })
        }

        if (this.order.tags.includes('personal-shopping')) {
          this.buttons.push({ label: 'Share Order', icon: 'link', id: 'share-order' })
        }

        if (this.user.iam.order.dispatch && this.orderLineItemsCanBeDispatched.length > 1) {
          this.buttons.push({ label: 'Dispatch items', icon: 'move_to_inbox', id: 'dispatch-items' })
        }

        if (this.user.iam.order.deliver && this.order.parentOrderID == null && this.orderLineItemsCanBeDelivered.length > 1) {
          this.buttons.push({ label: 'Deliver items', icon: 'done_all', id: 'deliver-items' })
        }

        if (this.order.type.name == 'outbound') {
          this.buttons.push({ label: 'Download Receipt', icon: 'receipt', id: 'download-receipt' })
        }

        if (this.order.type.name == 'outbound' || this.order.type.name == 'inbound') {
          this.buttons.push({ label: 'Download Invoice', icon: 'description', id: 'download-invoice' })
        }

        if (this.order.type.name == 'outbound' && this.transactionsDataSource.data.find(transaction => transaction.type === 'sale')?.status === 'paid') {
          this.buttons.push({ label: 'Download Customer Invoice', icon: 'description', id: 'download-customer-invoice' })
        }

        if (this.order.foreignID) {
          this.buttons.push({ label: 'View Shopify Order', icon: 'link', id: 'view-shopify-order' })
        }

        this.isLoading = false;
        this.dataSource.data = this.order.orderLineItems;
      });
  }

  onCustomerAddEdit(address: Address | null) {
    this._modalCtrl.open(AddressContactPage, { address: address }, { cssClass: 'full-screen-y' }).pipe(
      filter(data => data),
      mergeMap((address: Address) => {
        return this._api.updateOrder(this.order.ID, { consigneeID: address.ID })
      })
    ).subscribe(() => this._onRefresh())
  }

  onSupplierAddEdit(address: Address | null) {
    this._modalCtrl.open(AddressContactPage, { address: address }, { cssClass: 'full-screen-y' }).pipe(
      filter(data => data),
      mergeMap((address: Address) => {
        return this._api.updateOrder(this.order.ID, { consignorID: address.ID })
      })
    ).subscribe(() => this._onRefresh())
  }

  onButtonClick(buttonId: string) {
    switch (buttonId) {
      //called from mobiel only - allow to display all the actions buttons available
      case 'open-action-sheet':
        const actionSheetButtons = this.buttons.map(buttonObj => { return { title: buttonObj.label, icon: buttonObj.icon, key: buttonObj.id } })
        this._modalCtrl.actionSheet('Actions', actionSheetButtons)
          .pipe(
            filter((resp: IModalResponse) => resp.role == "submit"),
            map((resp: IModalResponse) => resp.data),
          )
          .subscribe((action: string) => this.onButtonClick(action))
        break;
      case 'create-fulfillment':
        this.onFulfill()
        break;
      case 'dispatch-items':
        this.onDispatchItems()
        break;
      case 'deliver-items':
        this.onDeliverItems()
        break;
      case 'download-receipt':
        this.downloadReceipt()
        break;
      case 'download-invoice':
        this.downloadInvoice()
        break;
      case 'download-customer-invoice':
        this.downloadCustomerInvoice()
        break;
      case 'share-order':
        let query = of(null)
        if (!this.order.linkFirstSharedAt) {
          query = this._api.updateOrder(this.order.ID, { linkFirstSharedAt: moment().utc() })
        }
        //extract root url
        query.subscribe(() => {
          const rootUrl = window.location.href.split('/orders')[0]
          const link = rootUrl + '/share/order/' + this.order.ID + '?accessToken=' + this.order.accessToken;
          navigator.clipboard.writeText(link);
          this._modalCtrl.info('Order Link Copied to Clipboard')
          this._modalCtrl.clipboard({
            title: 'Share Link',
            buttonText: 'Copy',
            value: link,
            valueLabel: 'Link'
          }, { cssClass: 'custom' }).pipe(filter(res => res)).subscribe((res) => {
            this._modalCtrl.info('Order Link Copied to Clipboard')
          });
        })
        break;
      case 'view-shopify-order':
        window.open(`https://${this.order.saleChannel.shopifyStoreName}.myshopify.com/admin/orders/${this.order.foreignID}`, '_blank');
        break;
    }
  }

  downloadReceipt() {
    this.isLoading = true
    this._api.downloadReceipt(this.order.ID).subscribe((response: Object) => {
      this.isLoading = false

      this._plugins.printPDF(
        response['receiptBase64'],
        `receipt_${this.order.ID}.pdf`,
        "letter"
      )
    })
  }

  downloadInvoice() {
    if (!this.order.consignee.ID) {
      this._modalCtrl.warning('Missing customer information.')
      return
    }

    const olisWithoutCost = this.order.orderLineItems.filter(oli => !oli.cost)
    if (this.order.type.name == "inbound" && olisWithoutCost.length > 0) {
      this._modalCtrl.warning(`The order contains items without cost. Invoices can be generated only for orders with all items with cost`)
      return
    }

    this.isLoading = true
    this._api.downloadInvoice(this.order.ID).subscribe((downloadInvoiceResponse: Object) => {
      this.isLoading = false

      this._plugins.printPDF(
        downloadInvoiceResponse['invoiceBase64'],
        `invoice_order_${this.order.ID}.pdf`
      )
    })
  }

  downloadCustomerInvoice() {
    this.isLoading = true
    this._api.downloadCustomerInvoice(this.order.ID).subscribe((downloadInvoiceResponse: Object) => {
      this.isLoading = false

      this._plugins.printPDF(
        downloadInvoiceResponse['invoiceBase64'],
        `customer_invoice_order_${this.order.ID}.pdf`
      )
    })
  }

  onAddTransaction() {
    this._modalCtrl.open(TransactionFormComponent, {
      type: 'purchase',
      fromAccountID: this.user.account.ID,
      currency: this.user.account.currency,
      orderID: this.order.ID,
    }, { cssClass: 'full-screen-y' }).pipe(
      filter(data => data),
    ).subscribe(() => this._onRefresh())
  }

  onAccept(orderLineItem: OrderLineItem) {
    this._modalCtrl.confirm('Accept Order Line Item?').pipe(
      filter((confirm: boolean) => confirm),
      mergeMap(() => {
        this.isLoading = true
        return this._api.acceptOrder(this.order.ID, [{ ID: orderLineItem.ID }])
      })
    ).subscribe(() => {
      this._onRefresh()
      this._modalCtrl.success('Order Line Item Updated')
    })
  }

  onCancel(orderLineItem: OrderLineItem) {
    this._modalCtrl.open(CancelOrderComponent, orderLineItem,{ cssClass: 'full-screen-y' }).pipe(
      filter(data => data),
      mergeMap((response: OrderCancelRequest) => {
        this.isLoading = true
        return this._api.cancelOrder(this.order.ID, response)
      })
    ).subscribe(() => {
      this._onRefresh()
      this._modalCtrl.success('Order Line Item Updated')
    })
  }

  onTransfer(orderLineItem: OrderLineItem) {
    this._modalCtrl.confirm('Transfer Order Line Items?').pipe(
      filter(res => res),
      mergeMap(() => {
        this.isLoading = true
        return this._api.createTransferOrder({
          accountID: this.order.accountID,
          type: 'transfer',
          consignorID: this.orderLineItemsToTransfer[0].item.warehouse.addressID,
          consigneeID: this.user.account.warehouses.find(warehouse => warehouse.addressID == this.order.consignor.ID).addressID,
          arrivalDate: null,
          reference1: `[ORDER #${this.order.reference1}]`,
          details: this.orderLineItemsToTransfer.map(oli => { return { itemID: oli.itemID } })
        })
      })
    ).subscribe((order) => {
      this._router.navigate(['/orders/' + order.ID])
      this._onRefresh()
      this._modalCtrl.success('Transfer Order Created')
    })
  }

  onFulfill() {
    this._modalCtrl.open(FulfillmentFormComponent, { mode: "create", orderID: this.order.ID }, { cssClass: 'full-screen-y' }).pipe(
      filter(res => res),
    ).subscribe((fulfillment: Fulfillment) => {
      this._modalCtrl.success('Fulfillment Created')
      let queryParams = {}
      if (fulfillment.shippingLabelFilename) {
        queryParams['action'] = 'show-label'
      }

      this._router.navigate([`orders/${this.order.ID}/fulfillment/${fulfillment.ID}`], { queryParams: queryParams })
    })
  }

  onReplace(orderLineItem: OrderLineItem) {
    let actionSelected
    let itemSelected;

    const actionsList = [
      { title: 'Source', description: 'Generate a source order', key: 'source' },
      { title: 'Replace', description: 'Select an item from the inventory', key: 'replace' },
      { title: 'Refund', description: 'Reject it and trigger the refund', key: 'refund' },
    ]
    this._modalCtrl.actionSheet('Replace Options', actionsList).pipe(
      filter((resp: IModalResponse) => resp.role == "submit"),
      map((resp: IModalResponse) => resp.data),
      mergeMap((action: string) => {
        actionSelected = action
        if (action == "source") {
          return this._modalCtrl.confirm("Are you sure you want to proceed by generating a sourcing order for this item?")
        } else if (action == "replace") {
          return this._modalCtrl.open(SelectItemComponent, { product: orderLineItem.product, variant: orderLineItem.variant, saleChannel: this.order.saleChannel, disableSource: true, orderLineItem: orderLineItem }, { cssClass: 'full-screen-y' }).pipe(

            mergeMap((item: Item) => {
              itemSelected = item
              return of(itemSelected)
            })
          )
        } else {
          return this._modalCtrl.confirm("Are you sure you want to proceed by refunding this order line item?")
        }
      }),
      filter(res => res),
      mergeMap((response) => {
        this.isLoading = true
        if (actionSelected == "source") {
          return this._api.replaceOrder(this.order.ID, { orderLineItems: [{ ID: orderLineItem.ID, action: 'source' }] })
        } else if (actionSelected == "replace") {
          return this._api.replaceOrder(this.order.ID, { orderLineItems: [{ ID: orderLineItem.ID, action: 'manual', itemID: itemSelected.ID }] })
        } else if (actionSelected == "refund") {
          return this._api.replaceOrder(this.order.ID, { orderLineItems: [{ ID: orderLineItem.ID, action: 'refund' }] })
        } else {
          return of(null)
        }
      })
    ).subscribe(() => {
      this._onRefresh()
      this._modalCtrl.success('Order Line Item Updated')
    })
  }

  onDispatch(orderLineItem: OrderLineItem) {
    this._modalCtrl.confirm('Set Order Line Item as Dispatched?').pipe(
      filter(res => res),
      mergeMap(() => {
        this.isLoading = true
        return this._api.fulfillmentDispatch(orderLineItem.orderID, orderLineItem.fulfillmentID, [{ ID: orderLineItem.ID }])
      })
    ).subscribe(() => {
      this._onRefresh()
      this._modalCtrl.success('Order Line Item Updated')
    })
  }

  onDispatchItems() {
    this._modalCtrl.confirm(`Are you sure you would like to mark ${this.orderLineItemsCanBeDispatched.length} items as dispatched?`, {
      title: 'Dispatch Items',
      confirmButtonText: 'Confirm',
      cancelButtonText: 'Cancel'
    }).pipe(
      filter(res => res),
      mergeMap(() => {
        this.isLoading = true
        return forkJoin(this.orderLineItemsCanBeDispatched.map((orderLineItem) =>
          this._api.fulfillmentDispatch(orderLineItem.orderID, orderLineItem.fulfillmentID, [{ ID: orderLineItem.ID }])
        ))
      })
    ).subscribe(() => {
      this._onRefresh()
      this._modalCtrl.success('Order Line Items Updated')
    })
  }

  onDeliver(orderLineItem: OrderLineItem) {
    this._modalCtrl.confirm('Set Order Line Item as Delivered?')
      .pipe(
        filter((res) => res),
        mergeMap(() => {
          this.isLoading = true;
          return this._api.fulfillmentDeliver(orderLineItem.orderID, orderLineItem.fulfillmentID, [{ ID: orderLineItem.ID }])
        })
      )
      .subscribe(() => {
        this._onRefresh();
        this._modalCtrl.success('Order Line Item Updated');
      });
  }

  onDeliverItems() {
    this._modalCtrl.confirm(`Are you sure you would like to mark ${this.orderLineItemsCanBeDelivered.length} items as delivered?`, {
      title: 'Deliver Items',
      confirmButtonText: 'Confirm',
      cancelButtonText: 'Cancel'
    }).pipe(
      filter(res => res),
      mergeMap(() => {
        this.isLoading = true
        return forkJoin(this.orderLineItemsCanBeDelivered.map((orderLineItem) =>
          this._api.fulfillmentDeliver(orderLineItem.orderID, orderLineItem.fulfillmentID, [{ ID: orderLineItem.ID }])
        ))
      })
    ).subscribe(() => {
      this._onRefresh()
      this._modalCtrl.success('Order Line Items Updated')
    })
  }

  onPrintShippingLabel(orderLineItem: OrderLineItem) {
    this._api.getFulfillmentShippingLabel(orderLineItem.orderID, orderLineItem.fulfillmentID).subscribe(res => {
      this._plugins.printPDF(
        res['base64ShippingLabel'],
        `shipping-label_${orderLineItem.fulfillmentID}.pdf`
      )
    })
  }

  onSetItemsCostPrice(orderLineItem: OrderLineItem) {
    const isConsignorItem = this.user.account.ID != orderLineItem.item.accountID
    this._modalCtrl.input({
      title: isConsignorItem ? 'Update Consignor Item Payout' : 'Update Item Cost',
      subtitle: orderLineItem.product.title + ' | ' + orderLineItem.variant.name,
      type: 'number',
      input: orderLineItem.cost,
    }).pipe(
      filter(cost => cost != null),
      mergeMap((cost: number) => {
        this.isLoading = true;
        return this._api.updateOrderLineItem(orderLineItem.orderID, orderLineItem.ID, { cost: cost })
      })
    ).subscribe((res) => {
      this._onRefresh();
      this._modalCtrl.success('Item Price Updated');
    });
  }

  onEditItemsNotes(orderLineItem: OrderLineItem) {
    this._modalCtrl.input({
      title: 'Order Line Item Notes',
      subtitle: orderLineItem.product.title + ' | ' + orderLineItem.variant.name,
      type: 'string',
      input: orderLineItem.notes,
    }).pipe(
      mergeMap((notes: string) => {
        this.isLoading = true;
        return this._api.updateOrderLineItem(orderLineItem.orderID, orderLineItem.ID, { notes: notes })
      })
    ).subscribe((notes) => {
      this._onRefresh();
      this._modalCtrl.success('Item Notes Updated');
    });
  }

  onEditReference() {
    this._modalCtrl.input({
      title: 'Order Reference',
      type: 'string',
      input: this.order.reference1,
    }).pipe(
      mergeMap((reference: string) => {
        this.isLoading = true;
        return this._api.updateOrder(this.order.ID, { reference1: reference })
      })
    ).subscribe((notes) => {
      this._onRefresh();
      this._modalCtrl.success('Order Updated');
    });
  }

  onOpenOrdersList(itemID: number) {
    this._api.getItemByID(itemID).subscribe((item: Item) => {
      // display only orders accessible by the account
      const availableOrders = item.orders.filter(
        (order) => order.account.ID == this.user.account.ID
      );
      this._modalCtrl.open(OrdersListComponent, availableOrders);
    });
  }

  onViewTransactionDetails(tx: Transaction) {
    this._modalCtrl.open(PayoutFormComponent, { txId: tx.ID }, { cssClass: 'full-screen-y' })
      .subscribe(() => {
        this._onRefresh()
      })
  }

  get orderLineItemsCanBeDispatched() {
    return this.order.orderLineItems.filter((orderLineItem) =>
      orderLineItem.status.name == 'fulfilling' &&
      (!(this.order.account.isConsignor && orderLineItem.fulfillment.courierID)) &&
      orderLineItem.canDispatch().value
    )
  }

  get orderLineItemsCanBeDelivered() {
    return this.order.orderLineItems.filter((orderLineItem) =>
      orderLineItem.canDeliver().value && !orderLineItem.canDeliver().disabled
    )
  }

  canBeFulfilled(orderLineItem: OrderLineItem): boolean {
    return this.user.organization.warehouses.filter(warehouse => warehouse.ID == orderLineItem.item.warehouseID).length == 1
  }

  shippingLabelAvailableForOrderLineItem(orderLineItem: OrderLineItem): boolean {
    const oliFulfillment = this.order.fulfillments.find(fulfillment => orderLineItem.fulfillmentID === fulfillment.ID)
    return oliFulfillment?.shippingLabelFilename != null;
  }

  canBeTransferred(): boolean {
    this.orderLineItemsToTransfer = this.order.orderLineItems.filter(oli => this.order.type.name == 'outbound' && oli.status.name == 'fulfill' && oli.item.warehouse && oli.item.warehouse.accountID == this.order.accountID && this.order.consignor.ID != oli.item.warehouse.addressID && oli.item.statusID == null)
    return this.orderLineItemsToTransfer.length > 0
  }

  copyToClipboard(orderLineItem: OrderLineItem) {
    let clipboardValues = []
    this.order.reference1 ? clipboardValues.push(`#${this.order.reference1}`) : clipboardValues.push(`ID:${this.order.ID}`)
    clipboardValues.push(`${orderLineItem.product.title}`)
    clipboardValues.push(`${orderLineItem.variant.name}`)
    orderLineItem.product.code ? clipboardValues.push(`${orderLineItem.product.code}`) : null
    clipboardValues.push(`${this.user.account.currencySymbol}${orderLineItem.price}`)
    orderLineItem.item.accountID != this.order.accountID ? clipboardValues.push(`(${orderLineItem.item.account.name})`) : null
    //join all values with •
    navigator.clipboard.writeText((clipboardValues.join(' • ')).toUpperCase());
    this._modalCtrl.info('Order Item Information Copied to Clipboard')
  }

  onRowClick(orderLineItem: OrderLineItem) {

    //add missing orderLineItem properties
    orderLineItem.order = this.order
    // return;
    const actions = []
    // accept
    if (this.order.type.name == 'outbound' && orderLineItem.status.name == 'pending' && this.user.iam.order.accept) {
      actions.push({ icon: 'done', title: 'Accept', description: orderLineItem.canAccept().message, disabled: !orderLineItem.canAccept().value, key: 'accept' })
    }

    // cancel
    if (this.user.iam.order.cancel && orderLineItem.canceledAt == null) {
      actions.push({ icon: 'close', title: 'Cancel', description: orderLineItem.canCancel().message, disabled: !orderLineItem.canCancel().value, key: 'cancel' })
    }

    // fulfill
    if (this.user.iam.order.fulfill && orderLineItem.canFulfill().value) {
      actions.push({ icon: 'move_to_inbox', title: 'Fulfill', description: orderLineItem.canFulfill().message, disabled: !orderLineItem.canFulfill().value, key: 'fulfill' })
    }

    // dispatch
    if (this.user.iam.order.dispatch && orderLineItem.status.name == 'fulfilling') {
      console.log(orderLineItem.fulfillment)
      console.log(orderLineItem.order.account)
      // If the consignor fulfills some items using the courier service the "dispatch" button is not available
      if (!(this.order.account.isConsignor && orderLineItem.fulfillment.courierID)) {
        actions.push({ icon: 'move_to_inbox', title: 'Dispatch', description: orderLineItem.canDispatch().message, disabled: !orderLineItem.canDispatch().value, key: 'dispatch' })
      }
    }

    // deliver
    if (this.user.iam.order.deliver && orderLineItem.canDeliver().value && this.order.parentOrderID == null) {
      actions.push({ icon: 'done_all', title: 'Deliver', description: orderLineItem.canDeliver().message, disabled: orderLineItem.canDeliver().disabled, key: 'deliver' })
    }

    // shipping label available for order line item
    if (this.shippingLabelAvailableForOrderLineItem(orderLineItem)) {
      actions.push({ icon: 'print', title: 'Print Shipping Label', description: '', disabled: false, key: 'print' })
    }

    // transfer
    if (this.canBeTransferred()) {
      actions.push({ icon: 'switch_access_shortcut', title: 'Transfer', description: '', disabled: false, key: 'transfer' })
    }

    // replace
    if (this.user.iam.order.replace && orderLineItem.replacePending) {
      actions.push({ icon: 'autorenew', title: 'Replace', description: '', disabled: false, key: 'replace' })
    }

    // add cancellation fee if not already created for consignment item
    const oliCancellationFee = this.transactionsDataSource.data.find(tx => tx.orderLineItemID == orderLineItem.ID && tx.type == 'cancellation fee')
    if (orderLineItem.canceledAt && orderLineItem.item.accountID != this.order.accountID && !oliCancellationFee) {
      actions.push({ icon: 'autorenew', title: 'Add Cancellation Fee', description: '', disabled: false, key: 'add-cancellation-fee' })
    }

    // fulfillment
    if (orderLineItem.fulfillmentID) {
      actions.push({ icon: 'local_shipping', title: 'Fulfillment', description: '', disabled: false, key: 'fulfillment-view' })
    }

    // order & notes
    actions.push({ icon: 'info', title: 'Details', description: '', disabled: false, key: 'details' })
    actions.push({ icon: 'account_tree', title: 'View Orders', description: '', disabled: false, key: 'orders' })
    actions.push({ icon: 'notes', title: 'Update Notes', description: '', disabled: false, key: 'notes' })
    actions.push({ icon: 'copy_content', title: 'Copy Info', description: '', disabled: false, key: 'copy-info' })

    // update cost
    if (this.user.iam.order.update) {
      const isConsignorItem = this.user.account.ID != orderLineItem.item.accountID
      actions.push({ icon: 'attach_money', title: isConsignorItem ? 'Update Payout' : 'Update Cost', description: '', disabled: false, key: 'update-cost' })
    }

    this._modalCtrl.actionSheet('Actions', actions).pipe(
      filter((resp: IModalResponse) => resp.role == "submit"),
      map((resp: IModalResponse) => resp.data),
    ).subscribe((action: string) => {
      switch (action) {
        case 'accept':
          this.onAccept(orderLineItem)
          break;
        case 'cancel':
          this.onCancel(orderLineItem)
          break;
        case 'fulfill':
          this.onFulfill()
          break;
        case 'dispatch':
          this.onDispatch(orderLineItem)
          break;
        case 'deliver':
          this.onDeliver(orderLineItem)
          break;
        case 'print':
          this.onPrintShippingLabel(orderLineItem)
          break;
        case 'transfer':
          this.onTransfer(orderLineItem)
          break;
        case 'replace':
          this.onReplace(orderLineItem)
          break;
        case 'orders':
          this.onOpenOrdersList(orderLineItem.item.ID)
          break;
        case 'fulfillment-view':
          this._router.navigate([`/orders/${this.order.ID}/fulfillment/${orderLineItem.fulfillmentID}`])
          break;
        case 'update-cost':
          this.onSetItemsCostPrice(orderLineItem)
          break;
        case 'notes':
          this.onEditItemsNotes(orderLineItem)
          break;
        case 'copy-info':
          this.copyToClipboard(orderLineItem)
          break;
        case 'add-cancellation-fee':
          this._modalCtrl.open(TransactionFormComponent, {
            type: 'cancellation fee',
            fromAccountID: orderLineItem.item.accountID,
            toAccountID: this.user.account.ID,
            currency: this.user.account.currency,
            orderID: this.order.ID,
            orderLineItemID: orderLineItem.ID,
          }, { cssClass: 'full-screen-y' }).pipe(
            filter(data => data),
          ).subscribe(() => this._onRefresh())
          break;
        case 'details':
          this._router.navigate([`/items/${orderLineItem.item.ID}`])
          break;
      }
    })
  }
}
