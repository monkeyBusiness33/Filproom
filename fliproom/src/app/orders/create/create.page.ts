import { Component, OnInit } from '@angular/core';
import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiListResponse, ApiService } from 'src/app/core/api.service';
import { ScannerResponse } from 'src/app/core/barcode-scanner.service';
import { PluginsService } from 'src/app/core/plugins.service';
import { UserService } from 'src/app/core/user.service';
import { IModalResponse, ModalService } from 'src/app/shared/modal/modal.service';
import { Address } from 'src/app/shared/models/Address.model';
import { Item } from 'src/app/shared/models/Item.model';
import { Product, ProductVariant } from 'src/app/shared/models/Product.model';
import { ProductSearchComponent } from 'src/app/shared/components/product-search/product-search.component';
import { environment } from 'src/environments/environment';
import { CheckoutPaymentReviewComponent } from '../modals/checkout-payment-review/checkout-payment-review.component';
import { Subscription, of } from 'rxjs';
import {mergeMap, filter, map, switchMap} from 'rxjs/operators';
import { Location } from '@angular/common';
import { Order } from 'src/app/shared/models/Order.model';
import { SelectItemComponent } from 'src/app/shared/components/select-item/select-item.component';
import { SaleChannel } from 'src/app/shared/models/SaleChannel';
import { InventoryListing, InventoryRecord } from 'src/app/shared/models/InventoryRecord';
import {AddressContactPage} from "../modals/address-contact/address-contact.page";
import {Warehouse} from "../../shared/models/Warehouse.model";
import * as moment from 'moment';

@Component({
  selector: 'app-create',
  templateUrl: './create.page.html',
  styleUrls: ['./create.page.scss'],
})
export class CreatePage implements OnInit {
  public isLoading: boolean = false;
  public isLoadingVariantItems: boolean = false;
  public environment = environment

  public orderForm = new FormGroup({
    reference: new FormControl(),
    customer: new FormControl(),
    saleChannel: new FormControl(),
    items: new FormArray([], Validators.required),
    paymentMethod: new FormControl(),
    setAsDelivered: new FormControl(),
    shippingCost: new FormControl(),
    basketStartedAt: new FormControl(moment().utc()),
    discount: new FormControl(0)
  })
  private activeSubs: Subscription[] = []
  private _localStorageKey: string = 'checkout-draft'
  public saleChannelsAvailable: SaleChannel[] = this.user.account.saleChannels.filter(sc => sc.accountID == this.user.account.ID ) // CHANGES: allowed shopify sales channel

  // temporary store the selected product & variant during item search
  public productSelected: Product;
  public variantSelected: ProductVariant;
  public itemsInStock: Item[] = []



  constructor(
    private _modalCtrl: ModalService,
    private _plugins: PluginsService,
    private _api: ApiService,
    private router: Router,
    public user: UserService,
    public location: Location
  ) { }

  ngOnInit() {

  }
  ionViewWillEnter() {
    // ask if restore cache if any
    if (localStorage.getItem(this._localStorageKey)) {
      this._modalCtrl.confirm("Resume Manual Order?").subscribe(confirm => {
        if (confirm) {
          this.orderForm.patchValue(JSON.parse(localStorage.getItem(this._localStorageKey)) || [])
        } else {
          localStorage.removeItem(this._localStorageKey)
        }
      })

    }

    //set default setAsDelivered value
    if(this.user.isPersonalShopper){
      this.orderForm.patchValue({setAsDelivered: false})
    }
    else{
      this.orderForm.patchValue({setAsDelivered: true})
    }

    // subscribe to nfc scan
    const sub1 = this._plugins.scanner.scannerReadListener.subscribe((scannerResponse: ScannerResponse) => {
      const barcode = scannerResponse.data.toLowerCase().trim()

      this.isLoading = true

      this._api.getItemsList(0, 2, null, {barcode: barcode, 'inventory.listings.saleChannelID': this.orderForm.value.saleChannel.ID})
        .pipe(
          mergeMap((res: ApiListResponse) => {
            const item = res.data[0] as Item
            let allowedItem = null
            if (!item) {
              this._modalCtrl.warning('No Item Matched With Barcode')
            } else if (!item.inventoryID) {
              this._modalCtrl.warning('Item Already Sold. Committed to another order')
            }
            else if (res.count > 1) {
              this._modalCtrl.warning('Multiple Items Found with the same barcode. Please contact support')
            } else {
              //all conditions passed item can be added to sale
              allowedItem = item
            }
            //once filtering conditions passed fetch item by ID
            return allowedItem ? this._api.getItemByID(allowedItem.ID): of(null)
          })
        ).subscribe((_item: Item)=> {
          _item?  this._addOrderLineItem(_item) : this.isLoading =false
      })

    })

    this.activeSubs.push(sub1)

    // if no warehouse selected yet
    if (!this.orderForm.value.saleChannel) {
      this.onSelectSaleChannel()
    }
  }

  ionViewWillLeave() {
    //update cache if leaving
    if (this.orderForm.touched) {
      localStorage.setItem(this._localStorageKey, JSON.stringify(this.orderForm.value))
    }
    this.activeSubs.map(sub => sub.unsubscribe())
  }

  private _addOrderLineItem(item: Item) {

    const isAlreadyInTheBasket = this.orderItems.value.find(oi => oi.item.ID == item.ID)
    if (isAlreadyInTheBasket) {
      this._modalCtrl.warning('Item Already in the basked')
      return
    }
    //optional subscription for when a confirm message needs to be promped for rxjs workflow
    let promptedMessage =  of(null)
    const isItemAllocatedToTransfer = item.status.name == "transit" && item.latestTransferOut
    if (isItemAllocatedToTransfer){
      //compose user message
      let transfersMessage = ''
      transfersMessage  = item.latestTransferOut.accountID ==  this.user.account.ID ? transfersMessage + `TRANSFER OUT (${item.latestTransferOut.ID})` : transfersMessage
      transfersMessage  = item.latestTransferIn.accountID ==  this.user.account.ID ? transfersMessage + ` TRANSFER IN (${item.latestTransferIn.ID})` : transfersMessage
      promptedMessage = this._modalCtrl.confirm(`Please note that this item: (${item.product.title.toUpperCase()} | ${item.variant.name.toUpperCase()}) has been allocated to the following: ${transfersMessage}, if you confirm this item will be removed from the transfer and assigned to its last location`)
    }

    promptedMessage.pipe(filter(res => isItemAllocatedToTransfer? res :true)).pipe(
      mergeMap(res=> {
        of(null)
        //cancel and restock item if it was allocated to a transfer
        if(isItemAllocatedToTransfer) {
          //get last transfer belonging to order of account
          let latestTransfer = item.latestAccountTransfer(this.user.account.ID)
          let latestTransferOli = latestTransfer.orderLineItems.find(oli => oli.itemID ==  item.ID)
          return this._api.cancelOrder(latestTransfer.ID, {orderLineItems: [{ID: latestTransferOli.ID, reason: 'sold while being transferred', restock: true}]})
        }
        return of(null)
    })).subscribe(res => {
      //restructure listing obejct to allow the calculation of the listing price
      this.orderItems.push(new FormControl({
        item: item,
        barcode: item.barcode,
        product: item.product,
        variant: item.variant,
        account: item.account,
        price:  item.inventory.listings.find(listing => listing.saleChannelID == this.orderForm.value.saleChannel.ID).price
      }))
      this._modalCtrl.success('Item added to basket')
      this.onWebClearSelection();
      this.isLoading = false
    })

  }
  onEditDiscount() {
    this._modalCtrl.input({title: 'Discount', type: 'number', input: this.orderForm.value.discount}).subscribe((discount: number) => {
      this.orderForm.patchValue({discount: discount})
    })
  }


  onEditReference() {
    this._modalCtrl.input({title: 'Reference', type: 'string', input: this.orderForm.value.reference}).subscribe((reference: string) => {
      this.orderForm.patchValue({reference: reference})
    })
  }

  onEditShipping() {
    const previousShippingCost = this.orderForm.value.shippingCost
    this._modalCtrl.input({title: 'Shipping', type: 'number', input: this.orderForm.value.shippingCost}).subscribe((shippingCost: number) => {
      this.orderForm.patchValue({shippingCost: shippingCost})
      // show message if shipping cost changed
        if (previousShippingCost != shippingCost) {
            this._modalCtrl.success('Shipping Cost Updated')
        }
    })
  }

  onEditCustomer() {
    this._modalCtrl.open(AddressContactPage, {address: this.orderForm.value.customer}).subscribe((customer: Address) => this.orderForm.patchValue({customer: customer}))
  }

  get orderItems(): FormArray {
    return this.orderForm.get('items') as FormArray
  }

  onScan() {
    this._plugins.scanner.setReadMode();
  }

  onSearch() {
    this._modalCtrl.open(ProductSearchComponent,{createExpressProduct: this.user.isPersonalShopper, private:!this.user.isExternalPersonalShopper }).pipe(
      mergeMap((product: Product) => this._modalCtrl.open(SelectItemComponent, {product: product, saleChannel: this.orderForm.value.saleChannel}))
    ).subscribe((item: Item) => {
      this.onItemSelected(item)
    })
  }


  onItemClicked(itemIdx) {
    const item = this.orderItems.value[itemIdx]
    this._modalCtrl.actionSheet('Actions', [
      {icon: '', title: item.price ? 'Update Price' : 'Set Price', description: '', key: 'price'},
      {icon: '', title: 'Remove', description: '', key: 'remove'},
    ]).pipe(
      filter((resp: IModalResponse) => resp.role == "submit"),
      map((resp: IModalResponse) => resp.data),
    ).subscribe(action => {
      switch (action) {
        case 'price':
          this.onEditItemPrice(itemIdx)
          break;
        case 'remove':
          this.onRemoveItem(itemIdx)
          break;
      }
    })
  }

  onEditItemPrice(itemIdx){
    const item = this.orderItems.value[itemIdx]
    this._modalCtrl.input({title: 'Price', type: 'number', input: item.price}).subscribe(price => {
      this.orderItems.at(itemIdx).value.price = price
      this._modalCtrl.success('Item Price Updated')
    })
  }

  onRemoveItem(itemIdx){
    this.orderItems.removeAt(itemIdx)
  }

  computeSalesFiguresTotal() {
    // Initial total amount calculation before discount
    let saleTotalAmount = this.orderForm.value.items.reduce((total, item) => total += item.price, 0);

    // Calculate discount as a percentage of the initial total amount
    const discountAmount = this.orderForm.value.discount || 0; // Ensure discount is a number
    saleTotalAmount -= discountAmount; // Apply the discount

    // Calculate tax based on the discounted total
    const taxAmount = saleTotalAmount * ((this.orderForm.value.saleChannel?.taxRate || 0) / 100);
    const subTotalAmount = saleTotalAmount - taxAmount;

    // Add shipping costs if any
    if (this.orderForm.value.shippingCost) {
        saleTotalAmount += this.orderForm.value.shippingCost;
    }

    return {
        saleTotalAmount: saleTotalAmount,
        taxAmount: taxAmount,
        shippingCost: this.orderForm.value.shippingCost || 0,
        subTotalAmount: subTotalAmount,
        discountAmount: discountAmount
    };
}

  onSelectSaleChannel() {
    //TODO: Hardcoded sale channel limits
    const userEmail = this.user.email.trim().toLowerCase()
    //MILANO STORE
    if (this.user.account.ID == 2548) {
      if (userEmail == 'jackcatarinolo@gmail.com') {
        let availableSCs = [3525]
        this.saleChannelsAvailable = this.saleChannelsAvailable.filter(sc => availableSCs.includes(sc.ID))
      }

      if (userEmail == 'eftiqorri@gmail.com' || userEmail== 'jasminegelso97@gmail.com') {
        let availableSCs = [2682]
        this.saleChannelsAvailable = this.saleChannelsAvailable.filter(sc => availableSCs.includes(sc.ID))
      }
    }

    //ONESTREET
    if (this.user.account.ID == 2530) {
      if (userEmail == 'davidemusella16@gmail.com' || userEmail == 'ritapolverino1234@icloud.com') {
        let availableSCs = [2694]
        this.saleChannelsAvailable = this.saleChannelsAvailable.filter(sc => availableSCs.includes(sc.ID))
      }

    }

    console.log(this.user.account.saleChannels)
    //If a personal shopper, allow to sell on external accounts
    if(this.user.isExternalPersonalShopper){
      this.saleChannelsAvailable = this.user.account.saleChannels
    }

    // auto select sale channel if only 1 available
    if (this.saleChannelsAvailable.length == 1 && !this.orderForm.value.saleChannel) {
      this.orderForm.patchValue({saleChannel: this.saleChannelsAvailable[0]})
      return
    }

    const saleChannelActions = []
    this.saleChannelsAvailable.map((sc: SaleChannel) => saleChannelActions.push({icon: '', title: sc.title, description: '', disabled: false, key: sc.ID}))

    this._modalCtrl.actionSheet('Sale Channels', saleChannelActions).subscribe((resp: IModalResponse) => {
      if (resp.role == 'submit') {
        this.clearOrderItems()
        const saleChannelID: number = resp.data
        const saleChannel = this.saleChannelsAvailable.find(sc => sc.ID == saleChannelID)

        this.orderForm.patchValue({saleChannel: saleChannel})
      } else { // incase location not selected
        this.location.back()
      }

    })
  }

  onPayClicked() {
    if(this.orderItems.value.length == 0){
      this._modalCtrl.warning('No Items in the basket')
      return
    }

    if(this.orderItems.value.filter(value => value.price == null).length > 0){
      this._modalCtrl.warning('Item Price Not Set For All Items in Basket')
      return
    }

    let sub = of(null)

    if (!this.orderForm.value.reference) {
      sub = this._modalCtrl.input({
        title: 'Add Order Reference',
        type: 'string',
        input: this.orderForm.value.reference
      }).pipe(
        mergeMap((reference: string | null) => {
          if (reference) {
            this.orderForm.patchValue({ reference });
          }
          return of(null);
        })
      );
    }

    const itemsWarehouseID = [...new Set(this.orderItems.value.map(orderItem => orderItem.item.warehouseID))]
    let extractOrderPhysicalOriginWarehouse = this.user.account.warehouses.filter(wh => itemsWarehouseID.includes(wh.ID))

    //TODO: Warehouse selection for personal shopper
    if(this.user.isExternalPersonalShopper){
      this._api.getWarehousesList(0, 100, null, {fulfillmentCentre: true, accountID: this.user.account.saleChannels[0].accountID}).subscribe((resp: ApiListResponse) => {
        if(resp.data.length > 0) {
          //TODO: Temporary fix for personal shopper warehouse selection (hardcoded to first warehouse)
          let warehouse = new Warehouse(resp.data[0] )
          extractOrderPhysicalOriginWarehouse = [warehouse]
          sub = of(null)
        }
      })
    }

    // If impossible to to automatically set the warehouse of the order, ask the user to patch it
    if (extractOrderPhysicalOriginWarehouse.length != 1 && !this.user.isExternalPersonalShopper) {
      sub = sub.pipe(
        mergeMap(() => this._modalCtrl.actionSheet('Select Location Where Item Sold At',
          this.user.account.warehouses.map(wh => {return {key: `${wh.ID}`, title: `${wh.name}`}})
        )),
        filter(resp => resp && resp.role === 'submit'),
        map((response => {
          extractOrderPhysicalOriginWarehouse = [this.user.account.warehouses.find(wh => wh.ID == response.data)]
          return null
        }))
      )

    }

    if (this.environment.screenType == 'mobile') {
      sub = sub.pipe(
        mergeMap(() => this._modalCtrl.open(CheckoutPaymentReviewComponent, this.orderForm.value)),
        filter((resp) => resp),
        mergeMap((data) => {
            this.orderForm.patchValue({
              paymentMethod: data.paymentMethodSelected,
              setAsDelivered: data.setAsDelivered
            })
          return of(null)
        })
      )
    }

    const discountPercentage = this.orderForm.value.discount || 0;
    const subtotalBeforeDiscount = this.orderForm.value.items.reduce((total, item) => total += item.price, 0);
    const discountAmount = (discountPercentage / 100) * subtotalBeforeDiscount;

    sub.pipe(

      mergeMap(() => {
        if ( !this.orderForm.value.paymentMethod ){
          this._modalCtrl.warning('Please Select Payment Method')
          return of(null)
        }
        else {
          return this._modalCtrl.confirm(`Create manual order for ${this.orderItems.length} item(s), totalling at ${this.user.account.currencySymbol} ${this.computeSalesFiguresTotal().saleTotalAmount.toFixed(2)}?`)
        }

      }),
      filter(res => res),
      mergeMap((res) => {
          this.isLoading = true
          let orderTags = this.user.isPersonalShopper ? 'personal-shopping' : 'manual'
          // Generate admin order first since the item owner order will decrease the quantity
          const body = {
            accountID:     this.user.isExternalPersonalShopper ? this.user.account.saleChannels[0].accountID : this.user.account.ID,
            saleChannelID: this.orderForm.value.saleChannel.ID,
            reference1:    this.orderForm.value.reference,
            type:          'outbound',
            consignee:     this.orderForm.value.customer,
            consignorID:   extractOrderPhysicalOriginWarehouse[0].addressID,
            details: [],
            tags: orderTags,
            fulfillment: {
              setAsDispatched: this.orderForm.value.setAsDelivered,
              setAsDelivered: this.orderForm.value.setAsDelivered,
            },
            transactions: [{
              toAccountID: this.orderForm.value.saleChannel.accountID,
              grossAmount: this.user.isPersonalShopper ? this.computeSalesFiguresTotal().subTotalAmount:this.computeSalesFiguresTotal().saleTotalAmount, // For PS orders the total should exclude the shipping amount
              currency: this.user.account.currency,
              type: 'sale',
              status: !this.orderForm.value.paymentMethod || this.orderForm.value.paymentMethod == 'unpaid' ? 'unpaid' : 'paid',
              paymentMethod: this.orderForm.value.paymentMethod,
              reference: this.orderForm.value.reference,
            }],
            basketStartedAt: this.orderForm.value.basketStartedAt
          }

          if (discountPercentage > 0) {
            body.transactions.push({
              toAccountID: this.orderForm.value.saleChannel.accountID,
              grossAmount: -discountAmount, // Negative because it's a discount
              currency: this.user.account.currency,
              type: 'discount',
              status:!this.orderForm.value.paymentMethod || this.orderForm.value.paymentMethod == 'unpaid' ? 'unpaid' : 'paid',
              paymentMethod: this.orderForm.value.paymentMethod,
              reference: this.orderForm.value.reference,
            });
          }
          

          // Add shipping costs if any
          if (this.orderForm.value.shippingCost) {
            body.transactions.push({
              toAccountID:  this.orderForm.value.saleChannel.accountID,
              grossAmount: this.orderForm.value.shippingCost,
              currency: this.user.account.currency,
              type: 'shipping',
              status:!this.orderForm.value.paymentMethod || this.orderForm.value.paymentMethod == 'unpaid' ? 'unpaid' : 'paid',
              paymentMethod: this.orderForm.value.paymentMethod,
              reference: this.orderForm.value.reference,
            })
          }

          this.orderItems.value.map(orderItem => body.details.push({
            itemID: orderItem.item.ID,
            price: orderItem.price
          }))


          return this._api.createSaleOrder(body)


      })
    )
    .subscribe((order: Order) => {

      this.isLoading = false
      this.orderForm.reset()
      this.orderItems.clear()

      localStorage.removeItem(this._localStorageKey)
      this._modalCtrl.success('Order Generated')
      this.router.navigate([`/orders/${order.ID}`])
    })
  }

  onWebSearch() {
    this._modalCtrl.open(ProductSearchComponent, {createExpressProduct:this.user.isPersonalShopper, private:!this.user.isExternalPersonalShopper, consignment :this.user.isExternalPersonalShopper}).subscribe((product: Product) => {
      this.onWebClearSelection()
      this.productSelected = product
      if (product.variants.length == 1) {
        this.onWebVariantSelect(product.variants[0])
      }
    })
  }

  onWebVariantSelect(variant: ProductVariant) {
    this.isLoadingVariantItems = true;
    this._api.getItemsList(0, 100, null, {
      'inventory.listings.productVariantID': variant.ID,
      'inventory.listings.saleChannelID': this.orderForm.value.saleChannel.ID,
      'inventory.quantity': '1:'
    }).pipe(
      switchMap((resp: ApiListResponse) => {
        this.isLoadingVariantItems = false;
        this.variantSelected = variant;
        this.itemsInStock = resp.data as Item[];

        // If no items in stock, prompt a message to source
        if (this.itemsInStock.length == 0) {
          return this._modalCtrl.confirm('No Items In Stock. Would you like to source this item?');
        } else {
          return of(null); // Emit a null value if there are items in stock
        }
      })
    ).subscribe(res => {
      if (res) {
        this.onWebSourceItem();
      }
      // Additional logic can be placed here if needed
    });
  }
  onOpenHelp() {
    this._modalCtrl.help('orders').subscribe(() => {})
  }

  computeListingPrice(item: Item) {
    const inventoryListing = item.inventory.listings[0]
    inventoryListing.product = item.product
    return this.orderForm.value.saleChannel.computeListingPrice(inventoryListing)
  }

  onWebSourceItem() {
    /**
     *  Allow to add a sourcing item to the manual order
     */

    this._modalCtrl.input({title: 'Price', type: 'number'}).pipe(
      filter(res => res != null),
      map(res => {
        this.isLoading = true
        return res
      }),
      mergeMap((price: number) => {
        //generate listing payouts
        const inventoryListing = new InventoryListing({
          saleChannel: this.orderForm.value.saleChannel,
          product: this.productSelected,
          variant: this.variantSelected,
          status: 'drafted',
          price: price
        })
        inventoryListing.payout = inventoryListing.saleChannel.computeListingPayout(inventoryListing)
        return this._api.createInventory({
          accountID: this.user.account.ID,
          productID: this.variantSelected.productID,
          productVariantID: this.variantSelected.ID,
          warehouseID: this.user.account.warehouses.find(wh => wh.fulfillmentCentre).ID,
          quantity: 1,
          virtual: false,
          notes: 'sourcing for order',
          listings: [{
            saleChannelID: inventoryListing.saleChannel.ID,
            productID: inventoryListing.product.ID,
            productVariantID: inventoryListing.variant.ID,
            status: 'drafted',
            payout: inventoryListing.payout
          }]
        })

  }),
      mergeMap((inventory: InventoryRecord) => this._api.getItemByID(inventory.items[0].ID))
    ).subscribe((item: Item) => {
      this._modalCtrl.success('Item to Source Created')
      this.isLoading = false
      this.onItemSelected(item)
    });
  }

  onItemSelected(item: Item) {
    this._api.getItemByID(item.ID).subscribe(_item => {
      this._addOrderLineItem(_item)
    })

  }

  clearOrderItems = () => {
    while (this.orderItems.length !== 0) {
      this.orderItems.removeAt(0)
    }
    this.orderForm.get('items').setValue([])
  }

  onWebClearSelection() {
    this.productSelected = null;
    this.variantSelected = null;
    this.itemsInStock = [];
  }

  onPaymentMethodSelected(paymentMethod) {
    this.orderForm.patchValue({
      paymentMethod: paymentMethod
    })
  }

  setAsDeliveredChange(checked: boolean) {
    this.orderForm.patchValue({
      setAsDelivered: checked
    }
    )
  }
}
