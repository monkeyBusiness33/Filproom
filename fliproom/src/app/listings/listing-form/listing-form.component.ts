import { Component, Input, OnInit } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import {filter, mergeMap} from 'rxjs/operators';
import { ApiService } from 'src/app/core/api.service';
import { UserService } from 'src/app/core/user.service';
import { UtilService } from 'src/app/core/util.service';
import { ProductSearchComponent } from 'src/app/shared/components/product-search/product-search.component';
import { ModalService } from 'src/app/shared/modal/modal.service';
import {InventoryListing, InventoryRecord, ListingBidSuggestion} from 'src/app/shared/models/InventoryRecord';
import {Product, ProductMatchLookup, ProductVariant} from 'src/app/shared/models/Product.model';
import {forkJoin} from "rxjs";
import {ProductMatchComponent} from "../../shared/product-match/product-match.component";

@Component({
  selector: 'app-listing-form',
  templateUrl: './listing-form.component.html',
  styleUrls: ['./listing-form.component.scss'],
})
export class ListingFormComponent implements OnInit {
  public isLoading: boolean = false;
  public isLoadingAction: boolean = false

  @Input() data: {
    listing: InventoryListing,
    inventory: InventoryRecord
    listingBidSuggestions: ListingBidSuggestion[]
  }

  public inventoryListingForm = new FormGroup({
    ID: new FormControl(null),
    saleChannel: new FormControl(null, Validators.required),
    accountID: new FormControl(null, Validators.required),
    product: new FormControl(null, Validators.required),
    variant: new FormControl(null, Validators.required),
    status: new FormControl('active', Validators.required),
    payout: new FormControl(null, Validators.required),
    price: new FormControl(null, Validators.required),
    priceSourceName: new FormControl(null),
    bestSellingListing: new FormControl(null),
    priceSourceMargin: new FormControl(null, Validators.required),
    lacedID: new FormControl(null),
  })

  public productsCatalogueForSyncing: Product[] = []
  public listingBidSuggestions: ListingBidSuggestion[] = []
  public inventoryListing : InventoryListing

  //LACED SPECIFIC INTEGRATION
  public selectedLacedProduct: Product;

  constructor(
    private _modalCtrl: ModalController,
    private _modalService: ModalService,
    public user: UserService,
    public utilsService: UtilService,
    private _api: ApiService
  ) { }

  ngOnInit() {
    this.inventoryListing = this.data.listing
    this.listingBidSuggestions = this.data.listingBidSuggestions
    this.inventoryListingForm.patchValue(this.data.listing)
    this.inventoryListingForm.valueChanges.subscribe((value) => this.checkAndUpdateFormState())
    this.inventoryListingForm.get('payout').valueChanges.subscribe((payout) => this.onPayoutChange(payout))
    this.inventoryListingForm.get('priceSourceMargin').valueChanges.subscribe((priceSourceMargin) => this.onPriceSourceMarginChange(priceSourceMargin))

    // if variant set
    if (this.data.listing.variant && this.data.listing.saleChannel.platform != 'laced') {
      this.productsCatalogueForSyncing = [this.data.listing.product]
    }

    if (this.data.listing.product.lacedID != null && this.data.listing.variant.lacedID == null) {
      this._api.getLacedProduct(this.data.listing.product.lacedID).subscribe((product) => {
        this.productsCatalogueForSyncing = [product]
        this.selectedLacedProduct = product
      })
    }
  }

  matchProduct() {
    if(this.inventoryListingFormData.saleChannel.platform === 'laced') {
      this._modalService.open(ProductMatchComponent, {productVariantID: this.data.inventory.variant.ID, externalSaleChannelID: this.data.listing.saleChannel.ID }, {cssClass: 'full-screen-y'})
      .subscribe((product) => {
        this.inventoryListingForm.patchValue({
          product: product,
          variant: product.variants.find(v => v.ID === this.inventoryListingFormData.variant.ID)
        })
        this._modalService.success(`Product and variant connected`)
      })
    } else {
      let selectedProductMatch:ProductMatchLookup = null
      this._modalService.open(ProductMatchComponent, {productVariantID: this.data.inventory.variant.ID, externalSaleChannelID: this.data.listing.saleChannel.ID }, {cssClass: 'full-screen-y'}).pipe(
        filter(res => res != null),
        mergeMap((productMatch: ProductMatchLookup) => {

          selectedProductMatch = productMatch
            return this._api.getProduct(productMatch.externalProductID)
          }
        )
      ).subscribe((product) => {
        this.inventoryListingForm.patchValue({
          product: product,
          variant: product.variants.find(v => v.ID ==selectedProductMatch.externalProductVariantID)
        })
        this._modalService.success(`Product and variant connected`)
      })
    }

  }

  onProductConnectSearch() {
    // Connect product to external account sale channel
    if(this.data.listing.saleChannel.accountID != this.user.account.ID) {
      this._modalService.open(ProductSearchComponent, {accountID: this.data.listing.saleChannel.accountID}).pipe(
        filter(prod => prod)
      ).subscribe((product: Product) => {
        this.productsCatalogueForSyncing = [product]
        this.inventoryListingForm.patchValue({
          product: product
        })
      })
    }
    // connect internal product to laced product catalogue
    else if (this.data.listing.saleChannel.platform == 'laced'){
      this._modalService.open(ProductSearchComponent, {catalogueSelected: 'laced'}).pipe(
        filter(prod => prod)
      ).subscribe((product: Product) => {
        this.selectedLacedProduct = product
        this.productsCatalogueForSyncing = [product]
        console.log(this.productsCatalogueForSyncing)
      })
    }

  }

  variantLacedIDRequiredValidator(control: AbstractControl): ValidationErrors | null {
    if (!control.value.lacedID) {
      return {
        lacedIDRequired: true
      };
    } else {
      return null;
    }
  }

  checkAndUpdateFormState() {
    /**
     * This function is used to enable-disable and set fields as required depending on the state of the form itself
     */

    console.log("checkAndUpdateFormState")
    // if market oracle turned on
    if (this.inventoryListingForm.value.priceSourceName != null) {
      this.inventoryListingForm.get('priceSourceMargin').addValidators(Validators.required);
    } else {
      this.inventoryListingForm.get('priceSourceMargin').clearValidators();
    }
    this.inventoryListingForm.get('priceSourceMargin').updateValueAndValidity({emitEvent: false});

    // if payout set - compute price
    if (this.inventoryListingForm.value.payout) {
      this.onPayoutChange(this.inventoryListingForm.value.payout)
    }

    // If laced, set lacedID as required
    if(this.inventoryListingForm.value.saleChannel.platform == 'laced') {
      this.inventoryListingForm.get('variant').addValidators(this.variantLacedIDRequiredValidator);
    } else {
      this.inventoryListingForm.get('variant').removeValidators(this.variantLacedIDRequiredValidator)
    }
    this.inventoryListingForm.get('variant').updateValueAndValidity({emitEvent: false});
  }

  get inventoryListingFormData() {
    return this.inventoryListingForm.getRawValue()
  }

  //GETTER
  get connectionExternalList() {
    if(this.inventoryListingFormData.saleChannel.platform == 'laced') {
      return this.inventoryListingForm.value.variant?.lacedID
    } else {
      return this.inventoryListingForm.value.variant?.ID
    }
  }

  onBack() {
    this._modalCtrl.dismiss()
  }

  onProductVariantMatchSelected(variant: ProductVariant) {
    if (this.inventoryListingFormData.saleChannel.platform == 'laced') {
      //update the product and variant in the form with the relecant laced product and variant IDs
      const updates = {
      lacedID: this.selectedLacedProduct.lacedID,
        lacedTitle: this.selectedLacedProduct.title,
        lacedCode:  this.selectedLacedProduct.code,
        variants: [{
          ID: this.inventoryListingFormData.variant.ID,
          lacedID: variant.lacedID,
          lacedName: variant.name,
        }]
      }
     this._api.updateProduct(this.inventoryListingFormData.product.ID, updates ).subscribe((product) => {
        this.inventoryListingForm.patchValue({
          product: product,
          variant: product.variants.find(v => v.ID == this.inventoryListingFormData.variant.ID)
        })
       console.log(this.inventoryListingForm.value)
     })
    }
    else{
      // this function is used to create or update the product match upon variant selected in the form
      this._api.matchProductVariant(this.inventoryListingFormData.product.ID, this.data.inventory.variant.ID, variant.ID).subscribe(() => {})
    }

  }

  onMarketOracleToggle(isChecked: boolean) {
    // don't allow priceSourceName setup for external sale channels
    if (this.inventoryListingForm.value.saleChannel.accountID == this.user.account.ID) {
      this.inventoryListingForm.patchValue({
        priceSourceName: isChecked ? 'stockx' : null,
        priceSourceMargin: null
      }, {emitEvent: false})
    }
  }

  onPayoutChange(payout: number) {
    const inventoryListing = this.inventoryListingFormData
    inventoryListing.payout = payout

    this.inventoryListingForm.patchValue({
      payout: payout,
      price: this.inventoryListingForm.value.saleChannel.computeListingPrice(inventoryListing)
    }, {emitEvent: false})
  }

  onPriceSourceMarginChange(priceSourceMargin: number) {
    // on inventory.priceSourceMargin change - calculate new payout and update all listings
    const marketPrice =  this.inventoryListingForm.value.variant.sourceProductVariant?.price

    if (marketPrice){
      const postFeesMarketPrice = ((marketPrice * 1.05) + 15) * this.utilsService.getExchangeRate('gbp', this.user.account.currency) // Fee, Shipping
      let unitPrice = (postFeesMarketPrice / (1 - (this.inventoryListingForm.value.priceSourceMargin / 100)))
      // rounding service
      unitPrice = Math.floor(unitPrice)
      this.inventoryListingForm.get('payout').setValue(unitPrice);

      // don't allow priceSourceMargin setup for external sale channels but allow payout
      const inventoryListing = this.inventoryListingForm.value
      inventoryListing.payout = unitPrice // need to manually set new payout to inventoryLisring because change function is tirggered before setting new value to form

      const updates = {
        payout: unitPrice,
        price: this.inventoryListingForm.value.saleChannel.computeListingPrice(inventoryListing)
      }
      if (this.inventoryListingForm.value.saleChannel.accountID == this.user.account.ID) {
        updates['priceSourceMargin'] = priceSourceMargin
      }
    }
  }

  getListingBidSuggestionMessage() {
    let rawListingForm = this.inventoryListingFormData
    const suggestion = this.listingBidSuggestions.find((suggestion) =>
      suggestion.saleChannelID == rawListingForm.saleChannel.ID && suggestion.productVariantID == rawListingForm.variant.ID
    )
    const listing = new InventoryListing(rawListingForm)
    listing.inventory = this.data.inventory
    return  listing.getSuggestionMessage(suggestion, this.user)
  }

  onSubmit() {
    this.inventoryListingForm.markAllAsTouched();

    if(this.inventoryListingForm.valid) {
      this.isLoadingAction = true
      this._modalCtrl.dismiss(this.inventoryListingFormData, 'submit')
      this.isLoadingAction = false
    }
  }

  get listing() : InventoryListing{
    return new InventoryListing(this.inventoryListingForm.value)
  }

  // Returns the disabled status of the market oracle feature.
  // This function is used in the HTML to disable market-oracle-toggle and conditionally show payout, priceSourceMargin, and market-oracle-toggle fields.
  get isMarketOracleDisabled(): boolean {
    return !this.user.iam.service.marketOracle || !this.inventoryListingFormData.variant || !this.listing.variant.sourceProductVariantID || (this.listing.variant.sourceProductVariantID && !this.listing.variant.sourceProductVariant.price)
  }

  // used for mat-select patching when objects are used instead of standard values
  compareObjectsByIDFn(o1: Object, o2: Object): boolean {
    return (o1 && o2 && o1['ID'] == o2['ID'])
  }

  compareObjectsByLacedIDFn(o1: Object, o2: Object): boolean {
    return (o1 && o2 && o1['lacedID'] == o2['lacedID'])
  }

  get lacedProductButtonLabel() {
    return this.selectedLacedProduct ? `( ${this.selectedLacedProduct.code} ) ${this.selectedLacedProduct.title}` : null
  }

  navigateToLink(url) {
    //open url in new tab
    window.open(url, '_blank');
  }
}
