import { Component, Input, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { filter, map, mergeMap } from 'rxjs/operators';
import { ApiService, ApiListResponse } from 'src/app/core/api.service';
import { UserService } from 'src/app/core/user.service';
import { ModalService } from '../../modal/modal.service';
import {InventoryListing, InventoryRecord} from '../../models/InventoryRecord';
import { Item } from '../../models/Item.model';
import {Order, OrderLineItem} from '../../models/Order.model';
import { Product, ProductVariant } from '../../models/Product.model';
import { SaleChannel } from '../../models/SaleChannel';
import { Warehouse } from '../../models/Warehouse.model';

export interface ISelectItem {
  product: Product
  variant?: ProductVariant | null
  disableSource: boolean
  warehouse?: Warehouse | null
  saleChannel?: SaleChannel
  orderLineItem?: OrderLineItem

}

@Component({
  selector: 'app-select-item',
  templateUrl: './select-item.component.html',
  styleUrls: ['./select-item.component.scss'],
})
export class SelectItemComponent implements OnInit {
  /**
   * This component is used to let the user manually select a specific item given a product and variant
   *
   *
   * disableSource: boolean - if true, the user will not be able to create a new item to source
   *
   * onVariantSelected() => void
   *    called when the user selects a variant. This is used to get the items list.
   *
   * onItemSelected(item: Item) => void
   *    called when the user selects an item. This will close the modal and return the item
   *
   * onSourceItem() => void
   *    called when the user clicks the source item button. This will create a purchase order with the item to source and return it
   *
   */
  @Input() data: ISelectItem;
  public product: Product;
  public variantsAvailableToSelect: ProductVariant[] = []
  public variantSelected: ProductVariant;
  public itemsList: Item[] = []
  public oliReplaced: OrderLineItem;
  public isLoading: boolean = false;
  public disableSource: boolean = false

  constructor(
    private _api: ApiService,
    private _modalCtrl: ModalController,
    private _modalService: ModalService,
    public user: UserService
  ) { }

  ngOnInit() {
    this.product = this.data.product
    // if passed variant, hardcode it
    this.variantsAvailableToSelect = this.data.variant ? [this.data.variant] : this.data.product.variants
    this.disableSource = this.data.disableSource || false
    this.oliReplaced = this.data.orderLineItem || null

    if (this.variantsAvailableToSelect.length ==  1) {
      this.onVariantSelected(this.variantsAvailableToSelect[0])
    }
  }

  onVariantSelected(variant: ProductVariant) {
    /**
     * This funciton is used to get the items list for the selected variant
     * - item has to be in an inventory (not sold)
     * - if the owner of the product is the same as the user, then the item has to be in the same variant
     * - if the owner of the product is not the same as the user, then the item variantID needs to be looked for through the external sale channel
     */
    this.isLoading = true;

    const params = {
      'inventory.quantity': '1:',

    }

    if(this.user.account.saleChannels.find(saleChannel => saleChannel.accountID == this.user.account.ID && saleChannel.platform != 'laced')){
      params['inventory.listings.productVariantID'] = variant.ID
    }
    else {
      params['inventory.productVariantID'] = variant.ID
    }


    if (this.data.saleChannel) {
      params['inventory.listings.saleChannelID'] = this.data.saleChannel.ID
    }

    if (this.data.warehouse) {
      params['inventory.warehouseID'] = this.data.warehouse.ID
    }


    this._api.getItemsList(0, 100, null, params).subscribe((resp: ApiListResponse) => {
      this.isLoading = false;
      this.variantSelected = variant
      console.log(resp)
      this.itemsList = resp.data as Item[]
    })
  }

  onClose() {
    this._modalCtrl.dismiss()
  }

  onItemSelected(item: Item) {
    this._modalCtrl.dismiss(item, 'submit')
  }

  onSourceItem() {
    if (this.variantSelected == null) {
      this._modalService.warning('Select a variant first')
      return
    }

    this._modalService.input({title: 'Price', type: 'number'}).pipe(
      filter(res => res != null),
      map(res => {
        this.isLoading = true
        return res
      }),
      mergeMap((price: number) => this._api.createInventory({
        accountID: this.user.account.ID,
        productID: this.variantSelected.productID,
        productVariantID: this.variantSelected.ID,
        warehouseID: this.user.account.warehouses.find(wh => wh.fulfillmentCentre).ID,
        quantity: 1,
        virtual: false,
        notes: 'sourcing for order',
        listings: [{
          saleChannelID: this.data.saleChannel.ID,
          productID: this.variantSelected.productID,
          productVariantID: this.variantSelected.ID,
          status: 'drafted',
          payout: price
        }]
      })),
      mergeMap((inventory: InventoryRecord) => this._api.getItemByID(inventory.items[0].ID))
    ).subscribe((item: Item) => {
      this._modalService.success('Item to Source Created')
      this.isLoading = false
      this.onItemSelected(item)
    });
  }

  getPriceDifference(inventoryListing: InventoryListing){
    return this.oliReplaced.price - inventoryListing.saleChannel.computeListingPrice(inventoryListing)
  }

  getInventoryListing(item: Item){
    if(this.data.saleChannel == null) return null
    const listing = item.inventory.listings.find(listing => listing.saleChannelID == this.data.saleChannel.ID)
    listing['saleChannel'] = this.data.saleChannel
    listing['product'] = this.data.product
    return listing
  }

}
