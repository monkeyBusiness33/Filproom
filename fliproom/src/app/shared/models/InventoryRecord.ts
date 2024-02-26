import { Deserializable } from './helpers/deserializable';
import {Product, ProductVariant} from './Product.model';
import { Item } from './Item.model';
import { Account } from 'src/app/core/user.service';
import { Warehouse, WarehouseLocation } from './Warehouse.model';
import {Status} from "./Status.model";
import { SaleChannel } from './SaleChannel';



export class InventoryRecord {
  ID: number
  productVariantID: number
  accountID: number
  account: Account
  product: Product
  productID: number // Added to be used in listing
  variant: ProductVariant
  items: Item[]
  quantity: number
  quantityIncoming: number
  quantityAtHand: number
  cost: number
  price: number
  payout: number //used for form logic not passed from the backend
  notes: string
  selectedQuantity:  number = 0
  priceSourceName: string //used for form logic not passed from the backend
  priceSourceMargin: number //used for form logic not passed from the backend
  virtual: boolean
  warehouseID: number
  warehouse: Warehouse
  location: WarehouseLocation
  locationID: number
  status: string  //used for form logic not passed from the backend
  listings: InventoryListing[]
  isSelectable: boolean
  //TODO: remove on rules application
  setPrice: boolean


  constructor(data: any) {
    if (data == null) {
      return null;
    }

    data.payout = data.payout ? parseFloat(data.price) : null
    data.cost = parseFloat(data.cost) || 0
    data.price = data.payout ? parseFloat(data.price) : null
    data.product = new Product(data.product)
    data.variant = new ProductVariant(data.variant)
    data.items = data.items ? data.items.map(item => new Item(item)): null
    data.warehouse = new Warehouse(data.warehouse)
    data.location = new WarehouseLocation(data.location)
    data.listings = data.listings ? data.listings.map(listing => new InventoryListing(listing)): []

    return Object.assign(this, data)
  }

  get stockAge(): Date {
    return (this.items.length > 0) ? this.items[0].createdAt : null
  }

  get payoutsRange() {
    const payouts = this.listings.map(listing => listing.payout)
    const minPayout = this.listings.length > 0 ? Math.min(...payouts) : null
    const maxPayout = this.listings.length > 0 ? Math.max(...payouts): null
    return {min: minPayout, max: maxPayout}
  }

  get priceSourceMarginRange() {
    const priceSourceMargins = this.listings.map(listing => listing.priceSourceMargin)
    const minPriceSourceMargin = this.listings.length > 0 ? Math.min(...priceSourceMargins) : null
    const maxPriceSourceMargin = this.listings.length > 0 ? Math.max(...priceSourceMargins): null
    return {min: minPriceSourceMargin, max: maxPriceSourceMargin}
  }

  /**
   * Gets the payout value for form usage:
   *
   *  - A: If inventory record has a payout value it means that it was used on the form component at the Inventory Record
   *      level, the purpose of this is to then allow the initialization of the form to occur through the Inventory Record
   *
   *  - B: returns a value when the min and max values are the same because that means the payout used on inventory level
   *     reflects the relative payouts of all the embedded sales channels
   *
   *  - C: returns null when the scenario above is not the case and will therefore allow the user to set a payout that will
   *    override the all the listing payouts for ease of listing price manipulation on the inventory level
   */

  get recordFormPayout() {
    if (this.payout) {
      return this.payout
    } else {
      return this.payoutsRange.min == this.payoutsRange.max ? this.payoutsRange.min : this.payoutsRange.min
    }
  }


  /**
   * Gets the price source name value for form usage:
   * - A: If inventory record has a price source name value it means that it was used on the form component at the Inventory Record
   *     level, the purpose of this is to then allow the initialization of the form to occur through the Inventory Record
   *     and to allow the user to override the price source name on the form
   *     (this is useful when the user wants to change the price source name on the inventory level and have it reflected on
   *     all the listings)
   *
   *     - B: returns a value when the set of values has one value because that means the price source name used on inventory level
   *     reflects the relative price source names of all the embedded sales channels listings
   */
  get recordPriceSourceName() {
    if (this.priceSourceName) {
      return this.priceSourceName
    } else {
      return this.listingsPriceSourceArray.length == 1  ? this.listingsPriceSourceArray[0]: null
    }
  }


  /**
   * Gets the status value for form usage:
   *
   *  - A  Status is already set on inventory level meaning it was used from form record initialisation
   *
   *  - B: Statuses are all the same of inventory listings belonging to inventory record -> return the shared
   *       listing status to be used on inventory level
   *  - C: Statuses are all the different of inventory listings belonging to inventory record -> return null to allow
   *       to override on form
   */

  get recordFormStatus() {
    if (this.status) {
      return this.status
    } else {
      return this.listingsStatusArray.length == 1  ? this.listingsStatusArray[0]: null
    }
  }

  /**
   * Gets the price source margin value for form usage:
   * - A: If inventory record has a price source margin value it means that it was used on the form component at the Inventory Record
   *    level, the purpose of this is to then allow the initialization of the form to occur through the Inventory Record
   *    and to allow the user to override the price source margin on the form
   * -B: returns a value when the min and max values are the same because that means the price source margin used on inventory level
   */

  get recordFormPriceSourceMargin() {
    if (this.priceSourceMargin) {
      return this.priceSourceMargin
    } else {
      return this.priceSourceMarginRange.min == this.priceSourceMarginRange.max ? this.priceSourceMarginRange.min : null
    }
  }

  get profitRangeMessage() {
    const profits = this.listings.map(listing => listing.price - this.cost)
    //get min and max profit from profits array
    let minProfit = this.listings.length > 0 ? Math.min(...profits) : null
    let maxProfit = this.listings.length > 0 ? Math.max(...profits): null
    if(minProfit == maxProfit && minProfit !== null){
      return `${minProfit?.toFixed(2)}`
    }
    else if(minProfit !== null && maxProfit !== null) {
      return `${minProfit?.toFixed(0)} - ${maxProfit?.toFixed(0)}`
    }
    else {
      return null;
    }
  }


  get profitsRange() {
    return {min: (this.payoutsRange.min - (this.cost || 0)), max: (this.payoutsRange.max - (this.cost || 0))}
  }

  get payoutRangeMessage() {
    const payouts = this.listings.map(listing => listing.payout)
    //get min and max payout from payouts array
    let minPayout = this.listings.length > 0 ? Math.min(...payouts) : null
    let maxPayout = this.listings.length > 0 ? Math.max(...payouts): null
    if(minPayout == maxPayout && minPayout !== null){
      return `${minPayout?.toFixed(2)}`
    }
    else if(minPayout !== null && maxPayout !== null) {
      return `${minPayout?.toFixed(0)} - ${maxPayout?.toFixed(0)}`
    }
    else {
      return null;
    }
  }

  get listingsStatusArray() {
    const differentStatuses = new Set()
    this.listings.map(listing => { differentStatuses.add(listing.status)})
    return Array.from(differentStatuses)
  }

  get listingsPriceSourceArray() {
    const differentPriceSources = new Set()
    this.listings.map(listing => { differentPriceSources.add(listing.priceSourceName)})
    return Array.from(differentPriceSources)
  }



  get activeListings(): InventoryListing[] {
    return this.listings.filter(l => l.status == 'active')
  }

  // this function checks if only the listings status has been changed. Used to let reatielr upate the status of its listings for a consignment inventory
  isStatusOnlyUpdated(salesChannels: SaleChannel[], updatedFormData: any, updatedListingData: any[]) {
    const tempListing = this.listings.filter(listing => salesChannels.find(channel => channel.ID === listing.saleChannelID));
    updatedListingData = updatedListingData.filter(listingFormControl => listingFormControl.valid && listingFormControl.value.ID != null);
    if(this.quantity !== updatedFormData.quantity) return false;
    if(this.cost !== updatedFormData.cost) return false;
    if(this.notes !== updatedFormData.notes || updatedFormData.notes === '') return false;
    if(tempListing.length !== updatedListingData.length) return false;
    for(let i=0;i<updatedListingData.length;i++) {
      if(tempListing[i].payout !== updatedListingData[i].value.payout) return false;
    }

    return true;
  }
}

export class InventoryListing {
  ID: number
  saleChannelID: number
  accountID: number
  productID: number
  productVariantID: number
  payout: number
  price: number
  status: string
  priceSourceName: string
  priceSourceMargin: number
  bestSellingListing: InventoryListing
  foreignID: number // Added for laced integration
  product: Product
  variant: ProductVariant
  inventory: InventoryRecord
  saleChannel: SaleChannel
  account: Account
  lacedID: number
  listingBidSuggestion: ListingBidSuggestion
  isActiveListing: boolean

  constructor(data: any) {
    if (data == null) return

    data.payout = parseFloat(data.payout)
    data.price = parseFloat(data.price)
    data.product = new Product(data.product)
    data.variant = new ProductVariant(data.variant)
    data.inventory = new InventoryRecord(data.inventory)
    data.account = new Account(data.account)
    data.saleChannel = new SaleChannel(data.saleChannel)
    data.listingCompetitionInfo = data.listingCompetitionInfo ? new ListingBidSuggestion(data.listingCompetitionInfo) : null

    return Object.assign(this, data)
  }

  get statusColor(): string {
    switch (this.status) {
      case 'active':
        return 'success'
      case 'draft':
        return 'warning'
      case 'deleted':
        return 'error'
      case 'disconnected':
        return 'error'
    }
  }

  getSuggestionMessage(suggestion, user){
    let title = 'Suggestion'
    let message = ''
    let color = 'warning'


    if(suggestion && !!this.price){
      // consignor item and currently active listing
      if(this.inventory.accountID != user.account.ID && this.isActiveListing){
        title = 'Best Price'
        message = ''
        color = 'success'
      }
      // currently best listing with no other listings to compete with and listing price is still lower or equal to suggestion
      else if( (suggestion.isMyListing &&( !suggestion.recommendedListingPrice || (suggestion.recommendedListingPrice && this.price <= suggestion.recommendedListingPrice + 1)))){
        title = 'Best Price'
        message = ''
        color = 'success'
      }
      //currently best listing does not belong to account but listing price is still lower or equal to suggestion
      else if(!suggestion.isMyListing  && this.price <= suggestion.recommendedListingPrice) {
        title = 'Best Price'
        message = ''
        color = 'success'
      }
      else{
        //clone listing to avoid changing the original listing
        const suggestedListing = new InventoryListing(JSON.parse(JSON.stringify(this)))
        suggestedListing.price = suggestion.recommendedListingPrice -1
        let recommendedPayOut = this.saleChannel.computeListingPayout(suggestedListing)
        message = `Lower payout to ${user.account.currencySymbol} ${ Math.round((recommendedPayOut)).toFixed(2)} to become best price`
        color = 'warning'
      }
    }
    // no price competition is required on this channel
    else if(!suggestion && !!this.price){
      title = 'Best Price'
      message = ''
      color = 'success'
    }
    return {title:title,message: message, color: color}
  }
}

export class ListingBidSuggestion {

  isMyListing:  boolean
  recommendedListingPrice: number
  saleChannelID: number
  productVariantID: number


  constructor(data: any) {
    if (data == null) return
    return Object.assign(this, data)
  }


}
