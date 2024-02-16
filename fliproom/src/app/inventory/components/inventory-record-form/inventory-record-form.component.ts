import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {AbstractControl, FormArray, FormControl, FormGroup, Validators} from "@angular/forms";
import {InventoryListing, InventoryRecord, ListingBidSuggestion} from 'src/app/shared/models/InventoryRecord';
import {Account, UserService} from "../../../core/user.service";
import {UtilService} from "../../../core/util.service";
import {Warehouse} from "../../../shared/models/Warehouse.model";
import {SaleChannel} from "../../../shared/models/SaleChannel";
import {Product, ProductVariant} from "../../../shared/models/Product.model";
import { environment } from 'src/environments/environment';
import {forkJoin, of, Subscription} from "rxjs";
import {filter, mergeMap} from "rxjs/operators";
import {InventoryRecordItemsComponent} from "../inventory-record-items/inventory-record-items.component";
import {IModalResponse, ModalService} from "../../../shared/modal/modal.service";
import {ModalController} from "@ionic/angular";
import {ApiService} from "../../../core/api.service";
import {ActivatedRoute, Router} from "@angular/router";
import {AnalyticsService} from "../../../core/analytics.service";
import {ListingFormComponent} from "../../../listings/listing-form/listing-form.component";
import {map} from "rxjs/operators";
import {Item} from "../../../shared/models/Item.model";
import {Status} from "../../../shared/models/Status.model";
import {ProductMatchComponent} from "../../../shared/product-match/product-match.component";


@Component({
  selector: 'app-inventory-record-form',
  templateUrl: './inventory-record-form.component.html',
  styleUrls: ['./inventory-record-form.component.scss'],
})
export class InventoryRecordFormComponent implements OnInit {
  /**
   * The inventoryForm is filled with inventory record to edit or in case of new inventory,
   * some of its fields are prefilled if possible (warehouse, virtual, variant..)
   *
   *
   * the core of the form logic happens in checkAndUpdateFormState()
   *
   * This function is triggered every time something change inside the form.
   * This function is used to manage all the constraints, requirements and scenario that the from might go through
   *
   */

  //INPUTS
  @Input() inventoryRecord: InventoryRecord;
  @Input() product: Product;
  @Input() displayMode: string; // 'compact' | 'standard'
  @Input() standalone: boolean; //set to true if the form is not part of a parent form (STANDALONE UPDATE)

  //OUTPUTS
  @Output() inventoryRecordSelected = new EventEmitter<{inventoryRecordForm: FormGroup,listingsFormArray: FormArray}>();

  constructor(
    private _api: ApiService,
    private _route: ActivatedRoute,
    private _modal: ModalService,
    private _modalCtrl: ModalController,
    public user: UserService,
    public utilsService: UtilService,
    private _router: Router,
    private _analytics: AnalyticsService,

  ) { }

  public environment = environment
  public isLoading: boolean = false; //loading data
  public isLoadingListings: boolean = false
  public isLoadingAction: boolean = false; //loading button
  public availableWarehouses: Warehouse[] = this.user.account.warehouses.filter(wh => wh.fulfillmentCentre)
  public saleChannels: SaleChannel[] = this.user.account.saleChannels
  public availableProductVariants: ProductVariant[] = []
  public userAccount: any = this.user.account.name;
  public formOptions: any = [];
  public listingBidSuggestions: ListingBidSuggestion[] = []



  public inventoryForm : FormGroup =  new FormGroup({})
  public inventoryListingsForm = new FormArray([])
  public activeSubs: Subscription[] = []
  // public validListings: AbstractControl[];

  /**
   * Form Loading
   */

  ngOnInit() {
    this.loadInventoryForm(this.inventoryRecord)
  }

  //Initialise forms
  loadInventoryForm(inventoryRecord: InventoryRecord){
    //Initialize inventory form
    this.inventoryForm = new FormGroup({
      ID: new FormControl(inventoryRecord.ID),
      accountID:  new FormControl(inventoryRecord.accountID, Validators.required), // patched from logged user data
      account:  new FormControl(inventoryRecord.account, Validators.required), // patched from data fetched
      product: new FormControl(inventoryRecord.product, Validators.required),   // patched from data fetched
      variant: new FormControl(inventoryRecord.variant, Validators.required),   // patched from data fetched or inserted manually
      virtual: new FormControl(inventoryRecord.virtual, Validators.required),
      quantity: new FormControl(inventoryRecord.quantity, !inventoryRecord.virtual ?Validators.required: null),
      quantityIncoming: new FormControl(inventoryRecord.quantityIncoming),
      quantityAtHand: new FormControl(inventoryRecord.quantityAtHand),
      status: new FormControl(inventoryRecord.recordFormStatus , Validators.required), //TODO: Remove the validator here
      payout: new FormControl(inventoryRecord.recordFormPayout,[ Validators.required, Validators.min(0.01)]),
      warehouse: new FormControl(inventoryRecord.warehouse),
      priceSourceName: new FormControl(inventoryRecord.recordPriceSourceName),
      priceSourceMargin: new FormControl(inventoryRecord.recordFormPriceSourceMargin),
      cost: new FormControl(inventoryRecord.cost),
      notes: new FormControl(inventoryRecord.notes),
    })

    //Initialise inventory listings form
    this.user.account.saleChannels.forEach((channel) => {
      let listing = inventoryRecord.listings.find((listing) => listing.saleChannel.ID === channel.ID)
      if (!listing) {
        listing = new InventoryListing({
          ID: null,
          saleChannel: channel,
          status: 'active',
          priceSourceName: null,
          priceSourceMargin: null,
          payout: null,
          price: null,
          product: channel.accountID == this.user.account.ID ? inventoryRecord.product : null,
          variant: channel.accountID == this.user.account.ID ? inventoryRecord.variant : null,
          isActiveListing: true
        })
        // Update an Inventory Record with the latest matched variant
        if (listing.saleChannel.accountID != this.user.account.ID) {
          const internalVariant = this.product.variants.find(_variant => _variant.ID == inventoryRecord.variant.ID)
          listing.variant = internalVariant.matchedVariants.find(externalVariant =>externalVariant.product && externalVariant.product.accountID == listing.saleChannel.accountID)
          listing.product = listing.variant ? listing.variant.product : null
        }
      }

      this.listingsFormArray.push(new FormGroup({
        ID: new FormControl(listing.ID),
        accountID: new FormControl(this.user.account.ID, Validators.required),
        saleChannel: new FormControl(listing.saleChannel, Validators.required),
        status: new FormControl(listing.status, Validators.required),
        priceSourceName: new FormControl(listing.priceSourceName),
        priceSourceMargin: new FormControl(listing.priceSourceMargin),
        payout: new FormControl(listing.payout,[ Validators.required, Validators.min(0.01)]),
        price: new FormControl( listing.price,[ Validators.required, Validators.min(0.01)]),
        product: new FormControl(listing.product, Validators.required),
        variant: new FormControl(listing.variant, Validators.required), // if this is null means, the listing requires to be synced
        lacedID: new FormControl(listing.lacedID? listing.lacedID : null),
        isActiveListing: new FormControl(listing.saleChannel.platform == 'shopify' ?listing.isActiveListing : true),
      }))
    })

    //Push form field subscription to activeSubs array
    this.activeSubs.push(this.inventoryForm.get('payout').valueChanges.subscribe((payout) => this.onPayoutChange(payout)))
    this.activeSubs.push(this.inventoryForm.get('priceSourceMargin').valueChanges.subscribe((priceSourceMargin) => this.onPriceSourceMarginChange(priceSourceMargin)))
    this.activeSubs.push(this.inventoryForm.get('status').valueChanges.subscribe((statusName) => this.onStatusChange(statusName)))
    this.activeSubs.push(this.inventoryForm.valueChanges.subscribe((value) => this.checkAndUpdateFormState()))


    this.isLoading = true
    //Complete Form initialization
    if (inventoryRecord.ID) {
      this.checkAndUpdateFormState()
    }
    else {
      //Add additional Validators when create mode
      this.inventoryForm.controls["quantity"].addValidators([Validators.min(1)]);
    }

    this.refreshListingBidSuggestions()
  }

  refreshListingBidSuggestions() {
    /**
     * this function is used to refresh the listingBidSuggestions array when something changes
     * Fetches competition data and suggestion for all external active listings
     * currently it is necessary only for external active shopify listings
     */
    const requests = []
    this.listingBidSuggestions = []
    //cycle through all formInventory lsitings and fetch competition info

    this.potentialListings.map(listing => {
      if (listing.value.saleChannel.platform == 'shopify') {
        requests.push(this._api.getListingBidSuggestion(listing.value.saleChannel.ID, listing.value.variant.ID, this.inventoryFormData.warehouse?.ID))
      }
    })
    forkJoin(requests).subscribe((competitionBids: ListingBidSuggestion[]) => {
      let index = 0
      this.potentialListings.map(listing => {
        if (listing.value.saleChannel.platform == 'shopify') {
          const competitionInfo = competitionBids[index]
          competitionInfo.saleChannelID = listing.value.saleChannel.ID
          competitionInfo.productVariantID = listing.value.variant.ID
          //map competition info to listing
          this.listingBidSuggestions.push(competitionBids[index])
          index++
        }
      })
    })
  }



  /**
   * FORM ACTIONS
   */

  checkAndUpdateFormState() {
    /**
     * This function is used to enable-disable and set fields as required depending on the state of the form itself
     * variant
     *  - if in edit mode                             => disable
     * virtual
     *  - if in edit mode                             => disable
     * warehouse
     *  - if in edit mode                             => disable
     * quantity
     *  - if edit mode and user has service.warehouse => disable
     *  - if above 100                                => cap to 100
     * priceSourceMargin
     *  - if above 99 or below - 99                   => set in the range
     *  - if set -                                    => compute payout
     */

      //console.log("checkAndUpdateFormState")

      // set validators for physical / virtual inventory unqiue fields
    const virtualInventoryRequiredFields = [];
    const physicalInventoryRequiredFields = ['warehouse'];
    if (this.inventoryFormData.virtual) {
      // virtual stcok - add virtual inventory validators
      for (const fieldName of virtualInventoryRequiredFields) {
        this.inventoryForm.get(fieldName).addValidators(Validators.required);
        this.inventoryForm.get(fieldName).updateValueAndValidity({emitEvent: false});
      }

      // virtual stcok - remove physical inventory validators
      for (const fieldName of physicalInventoryRequiredFields) {
        this.inventoryForm.get(fieldName).clearValidators();
        this.inventoryForm.get(fieldName).updateValueAndValidity({emitEvent: false});
      }
    }
    else {

      // quantity adding restriction
      if (this.inventoryFormData.ID  && this.inventoryFormData.quantity > this.inventoryFormData.quantity && this.inventoryRecord.quantity != null ){
        this._modal.info('Please add quantity through the "Add Stock" button')
        this.inventoryForm.get('quantity').setValue(this.inventoryRecord.quantity) ;
      }

      // virtual stcok - add physical inventory validators
      for (const fieldName of physicalInventoryRequiredFields) {
        this.inventoryForm.get(fieldName).addValidators(Validators.required);
        this.inventoryForm.get(fieldName).updateValueAndValidity({emitEvent: false});
      }

      // physical stcok - remove virtual inventory validators
      for (const fieldName of virtualInventoryRequiredFields) {
        this.inventoryForm.get(fieldName).clearValidators();
        this.inventoryForm.get(fieldName).updateValueAndValidity({emitEvent: false});
      }
    }

    // if market oracle turned on
    if (this.inventoryFormData.priceSourceName != null) {
      this.inventoryForm.get('priceSourceMargin').addValidators(Validators.required);
      this.inventoryForm.get('priceSourceMargin').updateValueAndValidity({emitEvent: false});
    } else {
      this.inventoryForm.get('priceSourceMargin').clearValidators();
      this.inventoryForm.get('priceSourceMargin').updateValueAndValidity({emitEvent: false});
    }

    // quantity value capping - prevents creation of too many items when adding stock
    if (this.inventoryFormData.quantity > 100 ){
      this._modal.info('Maximum quantity reached!');
      this.inventoryForm.get('quantity').setValue(100) ;
    }

    // don't allow to change quantity if item is not in an owned warehouse or account has warehousing service enabled
    if (this.inventoryFormData.ID && (this.inventoryFormData.warehouse?.accountID != this.user.account.ID || this.user.iam.service.warehousing) && !this.inventoryFormData.virtual) {
      this.inventoryForm.get('quantity').disable({emitEvent: false})
      //console.log("disable quantity")
    } else {
      this.inventoryForm.get('quantity').enable({emitEvent: false})
    }

    // margin value capping - prevents break the math with margin of 100
    if (this.inventoryFormData.priceSourceMargin != null) {
      if (this.inventoryFormData.priceSourceMargin >= 100){
        this.inventoryForm.get('priceSourceMargin').setValue(99) ;
      }
      else if (this.inventoryFormData.priceSourceMargin <= -100){
        this.inventoryForm.get('priceSourceMargin').setValue(-99);
      }
    }

    // listings
    for (var listingFormControl of this.listingsFormArray.controls) {
      // if market oracle turned on
      if (listingFormControl.value.priceSourceName != null) {
        listingFormControl.get('priceSourceMargin').addValidators(Validators.required);
      } else {
        listingFormControl.get('priceSourceMargin').clearValidators();
      }
      listingFormControl.get('priceSourceMargin').updateValueAndValidity({emitEvent: false});

      const errors = {}

      // don't allow to use virtual inventory on foreign listings
      if (this.inventoryFormData.virtual && listingFormControl.value.saleChannel.accountID != this.user.account.ID) {
        errors['virtualStockNotAllowedOnExternalSaleChannels'] = true
      }

      if(listingFormControl.value.payout !== listingFormControl.value.payout){
        errors['missingPayout'] = true
      }

      // don't allow to use virtual inventory on sale channels that have allowVirtualInventory = false
      if (this.inventoryFormData.virtual && !listingFormControl.value.saleChannel.allowVirtualInventory) {
        errors['virtualStockNotAllowedOnSaleChannel'] = true
      }

      listingFormControl.setErrors(errors)
      if (Object.keys(errors).length) {
        listingFormControl.disable({emitEvent: false})
      } else {
        listingFormControl.enable({emitEvent: false})
      }
    }

    // this.validListings = this.listingsFormArray.controls.filter(listingFormControl => listingFormControl.valid)
    // if payout set for all valid listings - not require payout (this required to allow form update)
    const payoutsValues = [... new Set(this.validListings.map(listingFormControl => listingFormControl.value.payout))]
    const listingStatuses = new Set(this.validListings.map(listingFormControl => listingFormControl.value.status))
    const priceSourceNameValues = new Set(this.validListings.map(l => l.value.priceSourceName))
    const priceSourceMarginUniqueValues = new Set(this.validListings.map(l => l.value.priceSourceMargin))
    if (payoutsValues.length > 1) {
      this.inventoryForm.get('payout').clearValidators();
    } else {
      this.inventoryForm.get('payout').addValidators(Validators.required);
      this.inventoryForm.get('status').patchValue(listingStatuses.has('active') ? 'active' : 'drafted', {emitEvent: false})
    }
    this.inventoryForm.get('payout').updateValueAndValidity({emitEvent: false});

    // if status set for all valid listings - not require status (this required to allow form update)
    const statusValues = [... new Set(this.validListings.map(listingFormControl => listingFormControl.value.status))]
    if (statusValues.length > 1) {
      this.inventoryForm.get('status').clearValidators();
    } else {
      this.inventoryForm.get('status').addValidators(Validators.required);
      this.inventoryForm.get('status').patchValue(statusValues[0], {emitEvent: false})
    }
    this.inventoryForm.get('status').updateValueAndValidity({emitEvent: false});

    // if priceSourceName set for all valid listings - not require priceSourceName (this required to allow form update)
    if (priceSourceNameValues.size == 1) {
      this.inventoryForm.get('priceSourceName').patchValue(Array.from(priceSourceNameValues)[0], {emitEvent: false})
    }

    // if priceSourceMargin set for all valid listings - not require priceSourceMargin (this required to allow form update)
    if (priceSourceMarginUniqueValues.size == 1) {
      // Prevent priceSourceMargin value from being set to null.
      // Occurs when the checkAndUpdateFormState() is called before the LISTING form is updated by the onPriceSourceMarginChange()
      // when the user enters the PRICE SOURCE MARGIN value.
      if (Array.from(priceSourceMarginUniqueValues)[0] === null) return
      this.inventoryForm.get('priceSourceMargin').patchValue(Array.from(priceSourceMarginUniqueValues)[0], {emitEvent: false})
    }

    // debug
    for (var key in this.inventoryForm.controls) {
      //console.log(`${this.inventoryForm.get(key).valid ? 'valid' : 'invalid'} - ${this.inventoryForm.get(key).dirty ? 'dirty' : 'untouched'} - ${key}`)
    }

    for (var listingFormControl of this.listingsFormArray.controls) {
      //console.log(`Listing Valid ${listingFormControl.valid}`)
      for (var key in (listingFormControl as FormGroup).controls) {
        //console.log(`>> ${key} ${listingFormControl.get(key).valid ? 'valid' : 'invalid'} ${listingFormControl.get(key).dirty ? 'touched' : 'untouched'}`)
      }
    }
  }

  onListingClick(listingForm: FormGroup) {
    console.log(this.getListingErrors(listingForm))
    // don't allow listing customization if thr listing is not allowed for this inventory record
    if (
      this.getListingErrors(listingForm).virtualInventoryNotAllowedOnExternalSaleChannel ||
      this.getListingErrors(listingForm).virtualInventoryNotAllowed ||
      this.getListingErrors(listingForm).marketOracleDisabled ||
      this.getListingErrors(listingForm).requiresReconnect
    ) {
      return
    }

    this._modal.open(ListingFormComponent, {listing: listingForm.getRawValue(), inventory: this.inventoryFormData, listingBidSuggestions: this.listingBidSuggestions}, {cssClass: 'full-screen-y'}).pipe(
      filter(res => res)
    )
      .subscribe((inventoryListing: InventoryListing) => {
        listingForm.patchValue({
          product: inventoryListing.product,
          variant: inventoryListing.variant,
          status: inventoryListing.status,
          priceSourceName: inventoryListing.priceSourceMargin,
          priceSourceMargin: inventoryListing.priceSourceMargin,
          payout: inventoryListing.payout,
          price: inventoryListing.price,
        })

        // if there are any other sale channels for the same external account ID just configured that arent' configured yet, configure them too
        const accountSaleChannelsListingsControls = this.listingsFormArray.controls.filter(listingForm => !listingForm.value.variant?.ID && (listingForm.value.saleChannel.accountID == inventoryListing.saleChannel.accountID))
        accountSaleChannelsListingsControls.map(listingForm => {
          const listingObject = listingForm.value
          listingObject.product = inventoryListing.product
          listingForm.patchValue({
            product: inventoryListing.product,
            variant: inventoryListing.variant,
            price: listingForm.value.saleChannel.computeListingPrice(listingObject) // need to compute the price now since the product was missing and the price cloudn't have been calculated
          })
        })
        this.checkAndUpdateFormState()
        this.refreshListingBidSuggestions()
      })
  }

  //toggle virtual inventory with optional forced status
  onVirtualToggle(available:boolean = null) {
    if (available == null) {
      this.inventoryForm.get('quantity').patchValue(this.inventoryForm.get('quantity').value == null ||this.inventoryForm.get('quantity').value == 0 ? 10:0, {emitEvent: true})
    } else {
      this.inventoryForm.get('quantity').patchValue(available? 10:0, {emitEvent: true})
    }
    this.checkAndUpdateFormState()
  }


  onInventoryItemsClick(){
    //fetch inventory items
    this._modal.open(InventoryRecordItemsComponent, {inventoryID: this.inventoryForm.get('ID').value}, {cssClass: 'full-screen-y'})
      .pipe(filter(res => res), mergeMap(res => {
          this.isLoading = true
          if (res == 'dismiss') {
            this._modalCtrl.dismiss(this.inventoryForm.value, 'submit')
            return of(null)
          }
          return this._api.getInventoryByID(this.inventoryForm.get('ID').value)
        })
      ).pipe(filter((res:any )=> res))
      .subscribe((inventoryRecord: InventoryRecord) => {
        //this.loadInventoryForm(inventoryRecord)
      })
  }

  onInventoryRecordSelected(){
    this.inventoryRecordSelected.emit({inventoryRecordForm: this.inventoryForm, listingsFormArray: this.listingsFormArray})
  }

  onFormSave(){
    this.inventoryRecordSelected.emit({inventoryRecordForm: this.inventoryForm, listingsFormArray: this.listingsFormArray})
  }




  /**
   * FORM CHANGES
   */

  onMarketOracleToggle(isChecked: boolean, bulkEditMargin?: number) {
    // on toggle market oracle sync - update all listings and then trigger form state check

    // set priceSourceName at inventory level to update the form and show the soucer margin input field
    this.inventoryForm.patchValue({
      priceSourceName: isChecked ? 'stockx' : null,
      priceSourceMargin: bulkEditMargin || null,
    }, {emitEvent: false})

    this.listingsFormArray.controls.map((listingFormControl) => {
      // don't allow priceSourceName setup for external sale channels
      if (listingFormControl.value.saleChannel.accountID == this.user.account.ID) {
        listingFormControl.patchValue({
          priceSourceName: isChecked ? 'stockx' : null,
          priceSourceMargin: bulkEditMargin || null,
        }, {emitValue: false})
      }
    })

    this.checkAndUpdateFormState()
  }

  onPayoutChange(payout: number) {
    //console.log(`onPayoutChange`, payout)
    // on inventory.payout change - update all listings  and then trigger form state check

    this.listingsFormArray.controls.map((listingFormControl) => {
      const inventoryListing = listingFormControl.value
      //console.log(`onPayoutChange`, inventoryListing)
      //patch only if variant is set - don't patch if product is not synced yet
      if(inventoryListing.variant && inventoryListing.variant.ID){
        inventoryListing.payout = payout // need to manually set new payout to inventoryLisring because change function is tirggered before setting new value to form
        inventoryListing.price = null


        // console.log(listingFormControl.value.saleChannel.computeListingPrice(inventoryListing))
        listingFormControl.patchValue({
          payout: payout,
          price: listingFormControl.value.product ? listingFormControl.value.saleChannel.computeListingPrice(inventoryListing) : null //don;t compute price if product not sycned yet
        }, {emitValue: false})
      }

    })

    this.checkAndUpdateFormState()
  }

  onPriceSourceMarginChange(priceSourceMargin: number) {
    //console.log(`onPriceSourceMarginChange`, priceSourceMargin)

    if (priceSourceMargin <= -100 || priceSourceMargin >= 100) {
      return
    }

    // on inventory.priceSourceMargin change - calculate new payout and update all listings
    const marketPrice = parseFloat(this.inventoryFormData.variant.sourceProductVariant?.price)

    if (marketPrice){
      const postFeesMarketPrice = ((marketPrice * 1.05) + 15) * this.utilsService.getExchangeRate('gbp', this.user.account.currency) // Fee, Shipping
      let unitPrice = (postFeesMarketPrice / (1 - (this.inventoryFormData.priceSourceMargin / 100)))

      // rounding service
      this.inventoryForm.get('payout').setValue(parseFloat(unitPrice.toFixed(2)));

      this.listingsFormArray.controls.map((listingFormControl) => {
        // don't allow priceSourceMargin setup for external sale channels but allow payout
        const inventoryListing = listingFormControl.value
        inventoryListing.payout = unitPrice // need to manually set new payout to inventoryLisring because change function is tirggered before setting new value to form

        const updates = {
          payout: unitPrice,
          price: listingFormControl.value.product ? listingFormControl.value.saleChannel.computeListingPrice(inventoryListing) : null // don't compute price if product not set yet
        }
        if (listingFormControl.value.saleChannel.accountID == this.user.account.ID) {
          updates['priceSourceMargin'] = priceSourceMargin
        }

        listingFormControl.patchValue(updates, {emitValue: false})
      })
    }
  }

  onStatusChange(statusName) {
    //console.log(`onStatusChange`, statusName)
    // on inventory.status change - update all listings and then trigger form state check

    this.listingsFormArray.controls.map((listingFormControl) => {
      listingFormControl.patchValue({
        status: statusName,
      }, {emitValue: false})
    })

    this.checkAndUpdateFormState()
  }


  /**
   * GETTERS
   */

  getListingErrors(listingFormControl) {
    /**
     * This function is used to compute the current errors for a listing
     */
    const listing = listingFormControl.value
    const errors = {
      'invalid': false, // true if there is any error
      'missingRequiredFields': false, //missing payout or status
      'requiresSetup': false, // only for external listings - missing product and variant match
      'virtualInventoryNotAllowedOnExternalSaleChannel': false, // only for external listings - if virtual inventory
      'virtualInventoryNotAllowed': false, // if sale channel has virtual inventory disabled
      'marketOracleDisabled': false, // only for external listings - don't allow market oracle
      'requiresReconnect': false // only for external listings - listing has been disconnected
    }

    if (this.inventoryFormData.virtual && listing.saleChannel.accountID != this.user.account.ID) {
      errors['virtualInventoryNotAllowedOnExternalSaleChannel'] = true
      errors['invalid'] = true
      return errors // return here to prevent for havint requiresSetup : true even if listing is not allowed on the sale channel
    }

    if (this.inventoryFormData.virtual && !listing.saleChannel.allowVirtualInventory && listing.saleChannel.accountID == this.user.account.ID) {
      errors['virtualInventoryNotAllowed'] = true
      errors['invalid'] = true
      return errors// return here to prevent for havint requiresSetup : true even if listing is not allowed on the sale channel
    }

    // if consign and couldn't find maching variant
    if (listing.saleChannel.accountID != this.user.account.ID && !listing.variant?.ID) {
      errors['requiresSetup'] = true
    }

    // if external listing with status disconnected
    if (listing.saleChannel.accountID != this.user.account.ID && listing.status == "disconnected") {
      errors['requiresReconnect'] = true
    }

    //LACED - couldn't find maching variant from laced
    if (listing.saleChannel.platform  == 'laced' && !listing.variant?.lacedID) {
      errors['requiresSetup'] = true
      errors['missingRequiredFields'] = true
    }

    // if edit mode and listing was not generated on creation and still not valid
    if (!listing.ID && !listingFormControl.valid) {
      errors['missingRequiredFields'] = true
    }

    if(!this.inventoryForm.valid){
      errors['missingRequiredFields'] = true
    }

    if (this.inventoryFormData.priceSourceName && listing.saleChannel.accountID != this.user.account.ID) {
      errors['marketOracleDisabled'] = true
    }

    errors['invalid'] = Object.keys(errors).reduce((accumulator, key) => {
      return accumulator || errors[key]
    }, false)

    return errors
  }

  getListingControlValidity(listingFormControl) {
    const errors = this.getListingErrors(listingFormControl)
    let count = 0
    Object.keys(errors).forEach((key) => {
      if (errors[key]) {
        count++
      }
    })
    return count <= 0
  }

  getFormGroup(control: AbstractControl) : FormGroup { return control as FormGroup; }

  get inventoryFormData() {
    return this.inventoryForm.getRawValue()
  }



  get listingsFormArray() {
    return this.inventoryListingsForm as FormArray;
  }

  get virtualMarketSyncAvailable() {
    return  this.inventoryRecord.virtual && this.user.iam.service.marketOracle
  }

  //Custom css class for variant info
  get variantInfoCustomCssClass() {
    if(!this.virtualMarketSyncAvailable && environment.screenType == 'mobile'){
      return 'col-span-3 flex-split'
    }
    else if(this.virtualMarketSyncAvailable && environment.screenType == 'mobile'){
      return 'col-span-4 flex-split'
    }
    else {
      return ''
    }
  }

  get fieldsContainerCustomCssClass() {
    if(this.inventoryForm.value.virtual && !this.virtualMarketSyncAvailable){
      if (this.trackCost) {
        return 'form-field-container-virtual';
      } else {
        return 'form-field-container-virtual-costless';
      }
    }
    else if(this.inventoryForm.value.virtual && this.virtualMarketSyncAvailable){
      if (this.trackCost) {
        return 'form-field-container-virtual-sync';
      } else {
        return 'form-field-container-virtual-sync-costless';
      }
    }
    else {
      if (!this.trackCost) {
        return 'form-field-container-costless';
      }
    }
  }

  get activeListings() {
    /**
     * This function returns a list of active listings.
     * The active listings in this list are used to compute and return the bidSugesstionMessage
     */
    return this.inventoryListingsForm.controls.filter((listingFormControl) => {
      if(this.inventoryRecord.virtual){
        return listingFormControl.value.status == 'active'  && listingFormControl.valid  && listingFormControl.value.saleChannel.accountID == this.user.account.ID && listingFormControl.value.saleChannel.allowVirtualInventory
      }
      else if (!this.inventoryRecord.virtual) {
        return listingFormControl.value.status == 'active'  && this.getListingControlValidity(listingFormControl)
      }
    })
  }

  //Return number maximum available listings for this inventory record depending on whether it's virtual or not
  get potentialListings() {
    return this.inventoryListingsForm.controls.filter((listingFormControl) => {
      if(this.inventoryRecord.virtual){
        return listingFormControl.value.saleChannel.accountID == this.user.account.ID && listingFormControl.value.saleChannel.allowVirtualInventory
      }
      else if (!this.inventoryRecord.virtual) {
        return  this.getListingErrors(listingFormControl)['requiresSetup'] == false
      }
    })
  }

  //Return number maximum available listings for this inventory record depending on whether it's virtual or not
  get validListings() {
    return this.listingsFormArray.controls.filter(listingFormControl =>  this.getListingControlValidity(listingFormControl));
  }

  //Return a single price if all listings have the same price or null if not
  get inventoryPrice() {
    const prices = this.activeListings.map((listingFormControl) => {
      return listingFormControl.value.price
    })
    if (prices.length === 0) {
      return null
    }
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    if (min === max) {
      return [min]
    } else {
      return [min, max]
    }
  }


  /**
   * EXTRAS
   */

  get formValidationHeaderError(){

    if(this.inventoryFormData.variant && this.user.iam.service.marketOracle && this.inventoryFormData.variant && !this.inventoryFormData.variant.sourceProductVariantID){
      return 'variant-not-synced'
    }
    if(this.inventoryFormData.variant && this.user.iam.service.marketOracle && this.inventoryFormData.variant && this.inventoryFormData.variant.sourceProductVariantID && !this.inventoryFormData.variant.sourceProductVariant.price){
      return 'variant-missing-public-price'
    }
    else {
      return null
    }

  }

  //Used when in bulk mode
  get inventoryBidSuggestionMessage() {
    let selectedListings = 0
    let relevantSuggestions = []
    this.activeListings.forEach((listingFormControl) => {
        const suggestion = this.listingBidSuggestions.find((suggestion) => {
            relevantSuggestions.push(suggestion)
            return suggestion.saleChannelID == listingFormControl.value.saleChannel.ID && suggestion.productVariantID == listingFormControl.value.variant.ID
          }
        )
        if(suggestion && !!listingFormControl.value.price){
          // consignor item and currently active listing
          if(this.inventoryFormData.accountID != this.user.account.ID && listingFormControl.value.isActiveListing){
            selectedListings ++
          }
          // currently best listing with no other listings to compete with and listing price is still lower or equal to suggestion
          else if( (suggestion.isMyListing &&( !suggestion.recommendedListingPrice || (suggestion.recommendedListingPrice && listingFormControl.value.price <= suggestion.recommendedListingPrice +1)))){
            selectedListings ++
          }
          //currently best listing does not belong to account but listing price is still lower or equal to suggestion
          else if(!suggestion.isMyListing  && listingFormControl.value.price <= suggestion.recommendedListingPrice) {
            selectedListings ++
          }
        }
        // no price competition is required on this channel
        else if(!suggestion && !!listingFormControl.value.price){
          selectedListings ++
        }
    })
    let color = 'basic'

    //User needs to setup listings for atleast one sale channel
    if(this.validListings.length == 0 && this.potentialListings.length == 0){
      
       // If consignor has 1 sale channel available that is external and product is not matched
       if (
        this.inventoryListingsForm.controls.find((listingFormControl) => {
          if(this.inventoryRecord.virtual){
            return false
          }
          else if (!this.inventoryRecord.virtual) {
            return  this.getListingErrors(listingFormControl)['requiresSetup'] == true
          }
        })
      ) {
        return {message: 'Match product to setup', color:  'warning'}
      }

      return {message: 'View & setup at least one listing', color:  'warning'}
    }

    if(this.validListings.length == 0){
      return {message: 'Please complete the listing form', color:  'basic'}
    }

    if(this.activeListings.length == 0){
      return {message: 'You have no listings with active status', color: 'warning'}
    }
    const quantity = this.inventoryForm.get('quantity').value;
    if(!quantity || quantity === 0) {
      return {message: 'Please complete the listing form', color: 'basic'}
    }

    if(selectedListings == this.activeListings.length){
      let message = 'You currently have the best price'
      this.activeListings.length > 1 ? message = 'Best price on all channels' : null
      return {message: message, color: 'success'}
    }
    if(selectedListings < this.activeListings.length && relevantSuggestions.length > 0){
      color = 'warning'
      // sort suggestions by recommendedListingPrice high to low
      relevantSuggestions.sort((a, b) => (a.recommendedListingPrice < b.recommendedListingPrice) ? 1 : -1)
      const saleChannel = this.user.account.saleChannels.find((saleChannel) => saleChannel.ID == relevantSuggestions[0].saleChannelID)
      let relevantListingControl =  this.activeListings.find((listingFormControl) => listingFormControl.value.saleChannel.ID == saleChannel.ID)
      let relevantInventoryListing = new InventoryListing(relevantListingControl.value)
      relevantInventoryListing.price = relevantSuggestions[0].recommendedListingPrice -1
      let recommendedPayout = saleChannel.computeListingPayout(relevantInventoryListing)
      let message = `Lower your payout to  ${this.user.account.currencySymbol} ${ (Math.round(recommendedPayout)).toFixed(2)}`
      if (environment.screenType == 'mobile') {
        message += ' to be best price'
      }
      return {message: message, color: color}
    }
    return {message: 'Best price on ' +selectedListings + '/' + this.activeListings.length + ' active listings', color: color}
  }

  getListingBidSuggestionMessage(rawListingForm) {
    const suggestion = this.listingBidSuggestions.find((suggestion) =>
      suggestion.saleChannelID == rawListingForm.saleChannel.ID && suggestion.productVariantID == rawListingForm.variant.ID
    )
    const listing = new InventoryListing(rawListingForm)
    listing.inventory = this.inventoryFormData
   return  listing.getSuggestionMessage(suggestion, this.user)
  }



  // used for mat-select patching when objects are used instead of standard values
  compareObjectsByIDFn(o1: Object, o2: Object): boolean {
    return (o1 && o2 && o1['ID'] == o2['ID'])
  }
  get trackCost() {
    let untracked = localStorage.getItem('untrack-cost');
    if ( untracked == 'true') {
      return false;
    }
    return true;
  }


  increment() {
    if (this.inventoryFormData.quantity < 99) {
      this.inventoryForm.get('quantity').setValue(this.inventoryFormData.quantity+1);
      this.checkAndUpdateFormState();
    }
  }

  decrement() {
    if (this.inventoryFormData.quantity == 1) {
      this.inventoryForm.get('quantity').setValue(null);
    } else if (this.inventoryFormData.quantity > 1) {
      this.inventoryForm.get('quantity').setValue(this.inventoryFormData.quantity-1);
    }
    this.checkAndUpdateFormState();
  }

  // modal to show user how to set up an additional sale channel
  addSaleChannel() {
    this._modal.confirm('You can set up an additional sale channel through: Settings > Sale Channels > Add Sale Channel. Please note adding a new sale channel will allow you to track internal sales. ').subscribe()
  }
}
