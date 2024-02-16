import { Component, OnInit, QueryList, ViewChildren } from '@angular/core';
import { Product, ProductVariant } from "../../shared/models/Product.model";
import { InventoryListing, InventoryRecord, ListingBidSuggestion } from "../../shared/models/InventoryRecord";
import { FormArray, FormControl, FormGroup, Validators } from "@angular/forms";
import { ApiService } from "../../core/api.service";
import { ActivatedRoute, Router } from "@angular/router";
import { ModalService, IModalResponse } from "../../shared/modal/modal.service";
import { UserService } from "../../core/user.service";
import { environment } from 'src/environments/environment';
import { forkJoin, of } from "rxjs";

import { InventoryRecordComponent } from "../components/inventory-record/inventory-record.component";
import { InventoryRecordFormComponent } from "../components/inventory-record-form/inventory-record-form.component";
import {map, mergeMap, filter, switchMap} from "rxjs/operators";
import { Warehouse } from "../../shared/models/Warehouse.model";
import { AnalyticsService } from "../../core/analytics.service";
import { ToursService } from 'src/app/core/tours.service';
import { InventoryFormsBulkEditComponent } from "../components/inventory-forms-bulk-edit/inventory-forms-bulk-edit.component"
import { EventActionEnum } from 'src/app/shared/enums/event-action.enum';


@Component({
  selector: 'app-inventory-bulk',
  templateUrl: './inventory-bulk.page.html',
  styleUrls: ['./inventory-bulk.page.scss'],
})
export class InventoryBulkPage implements OnInit {

  @ViewChildren(InventoryRecordFormComponent) inventoryRecordFormComponents: QueryList<InventoryRecordFormComponent>;

  public product: Product;
  public viewedInventoryRecordID: number; //inventory record selected when bulk editing
  public productID: number;
  public formType: string; // add, edit
  public inventoryType: string; // consignment, virtual, stock
  public redirect: string; // consignment, virtual, stock
  public inventoryTypes: string[]
  public environment = environment
  public isLoading: boolean = true; //loading data
  public isLoadingAction: boolean = false; //loading action
  public availableWarehouses: Warehouse[] = this.user.account.warehouses.filter(wh => wh.fulfillmentCentre)
  public viewableWarehouses: Warehouse[] = []; //warehouses that can be viewed and filtered by the user
  public formsInitialized: boolean = false;
  public bulkOverviewForm = new FormGroup({
    warehouse: new FormControl(this.availableWarehouses.length == 1 ? this.availableWarehouses[0] : null, Validators.required), //create inventory records in this warehouse
    warehouseFilter: new FormControl(null) //used to filter inventory records by warehouse in the UI
  })
  public buttons = []



  //Inventory Records Used to populate forms
  public relevantInventory: InventoryRecord[] = []; // filter by use case 'stock', 'virtual', 'consignment
  public existingInventory: InventoryRecord[] = []; //original inventory records used for comparison
  public formInventory: InventoryRecord[] = []; //inventory records used to populate form


  constructor(
    private _api: ApiService,
    private _route: ActivatedRoute,
    private _modalCtrl: ModalService,
    private _router: Router,
    public user: UserService,
    private _analytics: AnalyticsService,
    public tourService: ToursService,
  ) { }

  ngOnInit(): void { }

  ionViewWillEnter() {
    //Retrieve query params
    const queryParams = this._route.snapshot.queryParams
    this.productID = Number(this._route.snapshot.paramMap.get('productID'))

    this.viewedInventoryRecordID = Number(queryParams.inventoryRecordID)
    this.formType = queryParams.formType;
    this.user.iam.inventory.create && this.formType !== 'create' ? this.buttons.push({ label: 'add inventory', icon: 'add_box', id: 'bulk-add' }) : null;
    this.inventoryType = queryParams.inventoryType
    //Populate inventory types based on user logged
    this.inventoryTypes = ['stock'] //default
    if (this.user.iam.inventory.virtual) { this.inventoryTypes.push('virtual') }
    if (this.user.iam.service.consignment) { this.inventoryTypes.push('consignment') }

    //If productID is not present, redirect to inventory page
    if (!this.productID || !this.formType || !this.inventoryType) {
      this._router.navigate(['/inventory'])
      return
    }

    //Load product and inventory
    this.refreshInventoryRecords()


  }

  ngAfterViewChecked() {
    //add a timeout to ensure the form is initialized before accessing it
    setTimeout(() => {
      this.inventoryRecordFormComponents.forEach(formComponent => {
        // set form as initialized once the form component is loaded
        if (formComponent) {
          this.formsInitialized = true
        }
      })

    }, 300)

  }

  /**
   * Build Inventory Form
   *
   * Form in creation mode:
   *  A: Stock Inventory
   *     - Create new template inventory record for each variant
   *  B: Virtual Inventory
   *   - Create new inventory record for each variant and patch virtual existing inventory records
   *
   *
   * Form in edit mode:
   *  A: Stock Inventory
   *     - Use existing inventory belonging to account to generate forms for records to be edited
   *  B: Virtual Inventory
   *    - Create new inventory record for each variant and patch virtual existing inventory records
   *  B: Consignment Inventory
   *    - Display existing records only with no possibility to edit
   */
  private buildInventoryRecordsForm() {


    //clear current form inventory records
    this.formInventory = []

    //Filter inventory according to latest data retrieved
    this.filterInventoryRecords()
    //Create new inventory record for each variant
    if (this.inventoryType == 'stock' && this.formType == 'create') {
      this.product.variants.forEach((variant: ProductVariant) => {
        this.formInventory.push(this.createNewInventoryRecordTemplate(variant))
      })
    }
    else if (this.inventoryType == 'virtual') {
      //cycle through variants and patch with relevant inventory if no reelevant inventory patch with new template record
      this.product.variants.forEach((variant: ProductVariant) => {
        const existingVirtualInventoryRecord = this.relevantInventory.find(_inv => _inv.variant.ID == variant.ID)
        this.formInventory.push(existingVirtualInventoryRecord ? existingVirtualInventoryRecord : this.createNewInventoryRecordTemplate(variant))
      })
    }
    else if (this.formType == 'edit') {
      this.viewableWarehouses = []
      // TODO: Sort product variants by index
      this.relevantInventory.forEach((inventoryRecord: InventoryRecord) => {

        this.formInventory.push(inventoryRecord)
        //Add warehouse to viewable warehouses if not already present
        const viewableWarehouse = this.getInventoryRecordWarehouseFilter(inventoryRecord)
        !this.viewableWarehouses.find(_wh => _wh.ID == viewableWarehouse.ID && _wh.name.toLowerCase() == viewableWarehouse.name.toLowerCase()) ? this.viewableWarehouses.push(viewableWarehouse) : null
      })
      // Select default warehouse filter option if not set
      if (!this.bulkOverviewForm.value.warehouseFilter && this.formInventory.length > 0) {
        this.bulkOverviewForm.patchValue({ warehouseFilter: this.getInventoryRecordWarehouseFilter(this.formInventory[0]) })
      }
      //Filter form inventory by warehouse filter
      this.filterFormInventoryByWarehouse(this.bulkOverviewForm.value.warehouseFilter)
    }

    //Order inventory records by variant index
    this.orderInventoryRecords()


    //here the form finished to render and items have been displayed
    //if the tour sell item is active, continue with the tour
    if (this.tourService.activeTour == 'sell-item') {
      // wait for page to load and start toud
      setTimeout(() => {
        this.tourService.startTour('sell-item', { page: 'inventory-form' })
      }, 300)

      //listen for button click and move to next step in the tour
      const sub = this.tourService.tourHighlightClickObs.subscribe((data) => {
        if (data.stepId == 'insert-quantity') {
          (document.querySelector("mat-form-field[tourId='add-quantity'] input") as HTMLElement).focus()
        } else if (data.stepId == 'insert-payout') {
          (document.querySelector("mat-form-field[tourId='add-payout'] input") as HTMLElement).focus()
        } else if (data.stepId == 'save' && data.action == 'click') {
          sub.unsubscribe()
          this.tourService.completed()
          this.onSubmit()
        }
      })
    }
  }

  //Returns a displayable warehouse name for the bulk warehouse filter
  getInventoryRecordWarehouseFilter(inventoryRecord: InventoryRecord) {
    if (inventoryRecord.warehouse.accountID != this.user.account.ID && !this.user.account.saleChannels.find(_sc => _sc.accountID == inventoryRecord.account.ID)) {
      return new Warehouse({ ID: null, name: 'external' })
    }
    else if (!inventoryRecord.warehouse.ID) {
      return new Warehouse({ ID: null, name: 'transit' })
    }
    else {
      return inventoryRecord.warehouse
    }
  }

  /**
   * Filter form inventory when warehouse filter is changed
   */

  filterFormInventoryByWarehouse(warehouse: Warehouse) {
    this.formInventory = this.relevantInventory.filter(_inv => {
      const inventoryRecordWarehouseFilter = this.getInventoryRecordWarehouseFilter(_inv)
      return inventoryRecordWarehouseFilter.name.toLowerCase() == warehouse.name.toLowerCase() && inventoryRecordWarehouseFilter.ID == warehouse.ID
    })

    //Order inventory records by variant index
    this.orderInventoryRecords()
    //Refresh listing bid suggestions
  }

  /**
   * Create clean inventory record template to be used for form initialisation
   *  - create new inventory record
   *  - create new inventory listing for each sale channel:
   *      - if sale channel is account of logged user, link product to listing
   *      - if sale channel is  account of logged user, link variant to listing
   *
   */
  createNewInventoryRecordTemplate(variant: ProductVariant) {
    const inventoryRecord = new InventoryRecord({
      accountID: this.user.account.ID,
      account: this.user.account,
      product: this.product,
      variant: variant,
      virtual: this.inventoryType == 'virtual',
      quantity: null,
      status: 'active',
      warehouse: null,
      //create inventory listings
      listings: this.user.account.saleChannels.map(channel => {
        return this.createNewInventoryListingTemplate(channel, variant)
      })
    })
    //update inventory record's variant matchedVariants list with latest variant matches
    this.updateInventoryRecordMatches(inventoryRecord)
    return inventoryRecord
  }

  /**
   * Create new inventory listing template by passing a sale channel
   * - used in creation of inventory record template
   * - used to add missing sale channels on inventory record update
   */
  createNewInventoryListingTemplate(channel, variant) {
    return new InventoryListing({
      ID: null,
      accountID: this.user.account.ID,
      account: this.user.account,
      saleChannel: channel,
      saleChannelID: channel.ID,
      status: 'active',
      priceSourceName: null,
      priceSourceMargin: null,
      payout: null,
      price: null,
      product: channel.accountID == this.user.account.ID ? this.product : null,
      productID: channel.accountID == this.user.account.ID ? this.product.ID : null,
      variant: channel.accountID == this.user.account.ID ? variant : null,
      variantID: channel.accountID == this.user.account.ID ? variant.ID : null,
    })
  }

  /**
   * Update an Inventory Record with the latest matched variant and product list:
   *  - used in creation of inventory record template
   *  - used when individual record component is dismissed without saving and passing data back to parent so that latest matches can be fetched
   *
   * *!!* Update inventoryRecord's variant matchedVariants list with latest variant matches before using this method
   */

  updateInventoryRecordMatches(inventoryRecord: InventoryRecord) {
    //loop through inventory listings and update product and variant
    inventoryRecord.listings.map((listing) => {
      if (listing.saleChannel.accountID != this.user.account.ID) {
        const internalVariant = this.product.variants.find(_variant => _variant.ID == inventoryRecord.variant.ID)
        listing.variant = internalVariant.matchedVariants.find(externalVariant => externalVariant.product && externalVariant.product.accountID == listing.saleChannel.accountID)
        listing.productVariantID = listing.variant ? listing.variant.ID : null
        listing.product = listing.variant ? listing.variant.product : null
        listing.productID = listing.product ? listing.product.ID : null
      }
    })
  }

  /**
   * Refresh Variant Matches for all form inventory records
   *
   * - takes a product with its matched variants and updates the matched variants for each inventory record and product variant
   */
  refreshVariantMatches() {
    this.product.variants.forEach(variant => {
      this.product.matches.map(match => {
        if (match.productVariantID == variant.ID) {
          const variantMatch = match.externalVariant
          variantMatch.product = match.externalProduct
          //add variantMatch if it doesn't already exist
          variant.matchedVariants.find(_variantMatch => _variantMatch.ID == variantMatch.ID) ? null : variant.matchedVariants.push(new ProductVariant(variantMatch))
          //on form inventory replace all variants for this variant with the latest variant match
          this.formInventory.map(inventoryRecord => {
            if (inventoryRecord.variant.ID == variant.ID) {
              inventoryRecord.variant = variant
            }
          })
        }
      })
    })

  }


  /**
   * Refresh inventory records
   */
  refreshInventoryRecords() {
    this.isLoading = true
    //Fetch product data
    this._api.getProduct(this.productID).pipe(
      mergeMap(product => {
        this.product = product
        this.refreshVariantMatches()


        const params = {}

        if (this.inventoryType == 'virtual') {
          params['quantity'] = '0:99'
          params['virtual'] = true
        }
        if (this.inventoryType == 'consignment') {
          params['account.ID'] = `!${this.user.account.ID}`
          params['listings.productID'] = this.productID

        }
        else {
          params['account.ID'] = `${this.user.account.ID}`
          params['productID'] = this.productID
        }
        //Fetch existing inventory records
        return this._api.getInventory(0, 999999, 'createdAt:desc', params)
      }),
      mergeMap(inventoryRes => {
        //Fetch inventory records for each inventory record
        let requests = inventoryRes.data.map((inventoryRecord: InventoryRecord) => this._api.getInventoryByID(inventoryRecord.ID))
        return requests.length == 0 ? of([]) : forkJoin(requests)
      })
    ).subscribe((inventoryList: any) => {
      this.existingInventory = inventoryList
      //TODO: temp until backend call is fixed
      if (this.inventoryType == 'consignment') {
        this.existingInventory.map(_inv => {
          //delete _inv listings that are not linked to the logged user's account
          _inv.listings = _inv.listings.filter(listing => !!this.user.account.saleChannels.find(_sc => _sc.ID == listing.saleChannelID))
        })
      }

      //Loop through existing inventory records and update matched variants
      this.existingInventory.map((inventoryRecord: InventoryRecord) => {
        //update inventoryRecord's variant matchedVariants list with latest variant matches
        const foundVariant = this.product.variants.find(variant => inventoryRecord.variant && variant.ID == inventoryRecord.variant.ID)
        foundVariant ? inventoryRecord.variant.matchedVariants = foundVariant.matchedVariants : null
      })
      //Build Form
      this.buildInventoryRecordsForm()
      //load competition info
      this.isLoading = false
    })
  }

  /**
   * Update Warehouse for all inventory record forms
   *  - done to refresh the listing pricing suggestions for each inventory record
   */
  refreshBidSuggestions() {
    this.inventoryRecordFormComponents.forEach(formComponent => {
      //update warehouse if form is create
      if (this.formType == 'create') { formComponent.inventoryForm.patchValue({ warehouse: this.bulkOverviewForm.value.warehouse }) }
      formComponent.refreshListingBidSuggestions()
    })
  }




  /**
   *  Inventory type change through tab selection - Bulk edit only
   *  - update selected tab
   *  - refresh inventory records to display
   */
  onSegmentChanged(evt) {
    this.inventoryType = evt.detail.value
    //clear warehouse filter
    this.bulkOverviewForm.patchValue({ warehouseFilter: null })
    this.refreshInventoryRecords()
  }

  /**
   * Filtering of relevant inventory records to build forms based on inventorySelected and formType
   * - virtual: virtual inventory listing
   * - Stock: non-virtual inventory listings and belonging to account of logged user
   * - consignment: non-virtual inventory listings and belonging to external accounts (through listings)
   *
   *  *!!* Variants can only have one virtual inventory record for them so on 'create' && 'edit' formTypes fetch existing records
   *
   */
  filterInventoryRecords() {
    this.relevantInventory = this.existingInventory.filter(_inv => {
      if (this.inventoryType == 'stock' && !_inv.virtual && _inv.accountID == this.user.account.ID) {
        return true
      }
      else if (this.inventoryType == 'virtual' && _inv.virtual) {
        return true
      }
      else if (this.inventoryType == 'consignment' && !_inv.virtual && _inv.accountID != this.user.account.ID) {
        return true
      } else {
        return false
      }
    })
  }

  /**
   * Order inventory records by variant position
   *
   * - This is done to improve user experience when updating inventory records and locating a variant in the order
   */

  orderInventoryRecords() {
    this.formInventory.sort((a, b) => {
      return a.variant.position - b.variant.position
    })
  }

  /**
   * Mask an Inventory Record  with an inventory record form
   *
   * - inventory record form is used to override inventory record object
   * - listings form array is used to override inventory record listings
   * - do any additional processing for parsing data from form to inventory record:
   *      - Payout: check if payout can be set depending on the listings individual payouts else leave blank
   * - return masked inventory record
   *
   *
   * TODO: consider to embed this logic as a non modular function in the open inventory record function - stefano
   */
  maskInventoryRecord(inventoryRecordForm: FormGroup, listingsFormArray: FormArray, inventoryRecord: InventoryRecord) {
    //deep copy inventory record
    const clonedInventoryRecord = JSON.parse(JSON.stringify(inventoryRecord))
    // delete listings from cloned inventory record
    delete clonedInventoryRecord.listings

    //Map listings form array to listings array
    const listings = []
    listingsFormArray.controls.map((listingForm, index) => {
      listings.push(new InventoryListing(listingForm.value))

    })

    //cycle through sale channels and add missing listings only if they belong to the same account
    if (clonedInventoryRecord.accountID == this.user.account.ID) {
      this.user.account.saleChannels.map(channel => {
        if (!listings.find(listing => listing.saleChannel.ID == channel.ID)) {
          listings.push(new InventoryListing({
            ID: null,
            accountID: this.user.account.ID,
            account: this.user.account,
            saleChannel: channel,
            saleChannelID: channel.ID,
            status: 'active',
            priceSourceName: null,
            priceSourceMargin: null,
            payout: null,
            price: null,
            product: channel.accountID == this.user.account.ID ? this.product : null,
            productID: channel.accountID == this.user.account.ID ? this.product.ID : null,
            variant: channel.accountID == this.user.account.ID ? inventoryRecord.variant : null,
            variantID: channel.accountID == this.user.account.ID ? inventoryRecord.variant.ID : null,
          }))
        }
      })
    }
    //Map listings to inventory record
    clonedInventoryRecord.listings = listings
    this.updateInventoryRecordMatches(clonedInventoryRecord)

    //ANY ADDITIONAL PARSING

    //override inventory record object with inventory record form
    const maskedInventoryRecord = Object.assign(clonedInventoryRecord, inventoryRecordForm.value)
    return new InventoryRecord(maskedInventoryRecord)
  }



  /**
   * Save Inventory Record from child component inventory record form
   * - inventory record form is used to override inventory record object
   * - listings form array is used to override inventory record listings
   * - do any additional processing for parsing data from form to inventory record:
   */
  saveInventoryRecord(event) {
    const inventoryRecordForm = event.inventoryRecordForm as FormGroup
    const listingsFormArray = event.listingsFormArray as FormArray
    //find inventory record in formInventory if formType is edit use ID to find it otherwise use variantID

    let foundRecordIndex = null
    this.formInventory.map((_inv, index) => {
      if (this.formType == 'edit' && !inventoryRecordForm.value.virtual && _inv.ID == inventoryRecordForm.value.ID) {
        foundRecordIndex = index
      } else if (_inv.variant.ID == inventoryRecordForm.value.variant.ID) {
        foundRecordIndex = index
      }
    })
    const foundInventoryRecord = this.formInventory[foundRecordIndex]

    //convert inventory record form to inventory record
    const newInventoryRecord = this.maskInventoryRecord(inventoryRecordForm, listingsFormArray, foundInventoryRecord)
    //ovveride formInventory with latest inventory record
    this.formInventory[foundRecordIndex] = newInventoryRecord
    return newInventoryRecord

  }



  /**
   *  View Single Inventory Record Selected From Bulk
   *  - pass an inventory record
   *  - when form is closed the inventory record from formInventory should be updated with the latest values so then it
   *    can be used to update form component in bulk version
   *
   *  @param event {inventoryRecordForm: FormGroup, listingsFormArray: FormArray}
   *
   */
  onOpenInventoryRecord(event) {
    const inventoryRecord = this.saveInventoryRecord(event)
    this.saveBulkFormsInventoryRecordsProgress()
    let modalResponse = null

    this._modalCtrl.open(InventoryRecordComponent, { inventoryRecord: inventoryRecord, inventoryType: this.inventoryType, product: this.product, standalone: false }, { cssClass: 'full-screen-y' }).pipe(
      mergeMap((modalRes: any) => {
        modalResponse = modalRes
        //refetch latest product variant matches when modal is dismissed via backdrop and not via save

        return this._api.getProduct(this.product.ID)
      })).subscribe(product => {
        //update inventory record listings with latest variant matches if no response from the modal was received
        this.product = product
        this.refreshFormsInventoryRecords()
        this.refreshVariantMatches()
        //modal was dismissed via saving of the forms
        if (modalResponse) {
          this.saveInventoryRecord(modalResponse)
          this.refreshBidSuggestions()
        }

      })
  }


  /**
   * Refresh inventory records forms with latest formInventory InventoruRecords
   */
  refreshFormsInventoryRecords() {
    //create a deep copy of formInventory
    const clonedFormInventory = JSON.parse(JSON.stringify(this.formInventory))
    this.formInventory = []
    //rebuild inventory records forms
    clonedFormInventory.map(_inv => { this.formInventory.push(new InventoryRecord(_inv)) })
  }

  /**
   * Save bulk forms inventory records progress by iterating through formInventory and saving their current state to formInventory
   * - this is used to save the current state of the forms in case the user navigates away from the page
   */
  saveBulkFormsInventoryRecordsProgress() {
    // Access the child components and perform operations
    this.inventoryRecordFormComponents.forEach(formComponent => {
      const event = { inventoryRecordForm: formComponent.inventoryForm, listingsFormArray: formComponent.listingsFormArray }
      this.saveInventoryRecord(event)
    })
  }

  /**
   * Getter for virtual inventory select all functionality
   * - returns number of virtual inventory records that are not selected
   */
  get unavailableInventoryRecords() {
    if (this.formsInitialized) {
      let unselectedRecords = 0
      this.inventoryRecordFormComponents.forEach(formComponent => {
        if (formComponent.inventoryForm.value.quantity != 10 && formComponent.inventoryForm.value.virtual) {
          unselectedRecords++
        }
      })
      return unselectedRecords
    }
    return this.product.variants.length
  }

  /**
   * Toggle for select all virtual inventory records
   */
  onVirtualRecordsToggle(selectAll: boolean) {
    if (this.formsInitialized) {
      setTimeout(() => {
        this.inventoryRecordFormComponents.forEach(formComponent => {
          formComponent.onVirtualToggle(selectAll)
        })
      }, 200)
    }

  }


  /**
   * Submit Inventory Records Forms
   *
   * Loop through inventoryRecordForms and create or update inventory records
   *
   * A: If formType is create and inventory type is stock
   *  - make sure warehouse is selected
   *  - create inventory records for each form where quantity is greater than 0 and form is valid
   *
   * B: If formType is create or edit and inventory type is virtual
   * - create inventory records for each form where quantity is 10 but before was 0 and form is valid
   * - update inventory records for each form where (quantity is 0 but before was 10 or values changed )and form is valid
   */
  onSubmit() {
    if (this.formType == 'create' && this.inventoryType == 'stock') {
      this.bulkOverviewForm.markAllAsTouched()
      if (!this.bulkOverviewForm.valid) {
        this._modalCtrl.warning('Please fill out all required fields')
        return
      }
    }


    //if consignment tab is selected show user they cant update inventory records
    if (this.inventoryType == 'consignment') {
      for (let i = 0; i < this.existingInventory.length; i++) {
        const updatedFormComponent = this.inventoryRecordFormComponents.toArray()[i];
        const listings = updatedFormComponent.listingsFormArray.controls;
        const inventoryFormData = updatedFormComponent.inventoryForm.getRawValue();
        if (!this.existingInventory[i].isStatusOnlyUpdated(this.user.account.saleChannels, inventoryFormData, listings)) {
          this._modalCtrl.info('This is consignor stock. You can only update the status of your listings')
          return
        }
      }
      this.isLoadingAction = true;
      const statusUpdateRequest = [];
      this.inventoryRecordFormComponents.forEach(formComponent => {
        const listingsFormArray = formComponent.listingsFormArray;
        const inventoryFormData = formComponent.inventoryForm.getRawValue();

        const body = {
          listings: []
        };

        const listingRequests = listingsFormArray.controls.filter(listingFormControl => listingFormControl.value.ID != null && listingFormControl.value.saleChannel.accountID == this.user.account.ID && listingFormControl.valid && !formComponent.getListingErrors(listingFormControl).invalid).map(listingFormControl => {
          statusUpdateRequest.push( this._api.updateInventoryListing(listingFormControl.value.ID, {
            ID: listingFormControl.value.ID,
            status: listingFormControl.value.status,
          }))
        })
      })

      if (statusUpdateRequest.length > 0) {
        this._analytics.trackEvent('inventory_update_bulk')
        forkJoin(statusUpdateRequest).subscribe((inventoryRecords: InventoryRecord[]) => {
          this._modalCtrl.success('Inventory Records Updated')
          this.isLoadingAction = false
          this.refreshInventoryRecords()
        })
      }
      return
    }
    const createRequests = []
    const updateRequests = []

    let validity = true;

    /**
     *  Switched from forEach to regular for loop so that return breaks.
     *  Added instant feedback on invalid forms.
     */

    this.inventoryRecordFormComponents.forEach(formComponent => {
      //  Checking if row contains invalid data - quantity is > 0 (virtual inventory box enabled) but validation failed.
      if (formComponent.inventoryForm.status == 'INVALID' && formComponent.inventoryForm.value.quantity > 0) {
        formComponent.inventoryForm.markAllAsTouched()
        validity = false
        return
      }
      //Creation of inventory records
      if (!formComponent.inventoryForm.value.ID && formComponent.inventoryForm.value.quantity > 0) {
        formComponent.inventoryForm.markAllAsTouched()
        if (formComponent.inventoryForm.valid) {
          const inventoryFormData = formComponent.inventoryForm.value
          const body = {
            accountID: this.user.account.ID,
            // order info
            reference1: inventoryFormData.notes,
            warehouseID: this.bulkOverviewForm.value.warehouse?.ID,
            setAsDelivered: !this.user.iam.service.warehousing,

            // inventory info
            productID: inventoryFormData.product.ID,
            productVariantID: inventoryFormData.variant.ID,
            virtual: inventoryFormData.virtual,
            quantity: inventoryFormData.quantity,
            cost: inventoryFormData.cost,
            notes: inventoryFormData.notes,
            status: inventoryFormData.status,

            //listings info
            listings: [],
          }


          const listingsToCreate = formComponent.listingsFormArray.controls.filter(listingForm => listingForm.valid && !formComponent.getListingErrors(listingForm).invalid)
          this._analytics.trackEvent('inventory_add_bulk')
          createRequests.push(this._api.createInventory(body).pipe(
            switchMap((inventoryCreated) => {
              return this._api.createInventoryListings(inventoryCreated.ID, listingsToCreate.map(listingForm => {
                const listingFormData = listingForm.value
                if (!listingFormData.payout) {
                  validity = false
                }
                return {
                  saleChannelID: listingFormData.saleChannel.ID,
                  accountID: inventoryCreated.accountID,
                  inventoryID: inventoryCreated.ID,
                  productID: listingFormData.product.ID,
                  productVariantID: listingFormData.variant.ID,
                  status: listingFormData.status,
                  payout: listingFormData.payout,
                  price: listingFormData.price,
                  priceSourceName: listingFormData.priceSourceName,
                  priceSourceMargin: listingFormData.priceSourceMargin,
                  isActiveListing: listingFormData.isActiveListing ?? false,
                }
              }))
            })
          ))
        }
      }
      //Update of inventory records
      else if (formComponent.inventoryForm.value.ID) {
        console.log('UPDATE INVENTORY RECORDS')

        const currentInventoryRecord = this.existingInventory.find(_inv => _inv.ID == formComponent.inventoryForm.value.ID)
        formComponent.inventoryForm.markAllAsTouched()
        if (formComponent.inventoryForm.valid) {
          const inventoryFormData = formComponent.inventoryForm.value
          const body = {
            // inventory info
            //quantity: inventoryFormData.quantity,
            cost: inventoryFormData.cost,
            notes: inventoryFormData.notes,

            //listings info
            listings: [],
          }

          // Inventory type virtual quantity adjustment
          if (inventoryFormData.virtual) {
            const quantity = inventoryFormData.quantity == 10 ? 10 : 0
            body['adjustQuantity'] = quantity - currentInventoryRecord.quantity
          }
          else {
            // this applies only for accoutns that don't have warehousing service and inventory is not ad another warehouse
            const qtyDelta = inventoryFormData.quantity - currentInventoryRecord.quantity
            if (qtyDelta < 0) {
              body['adjustQuantity'] = qtyDelta
            }
          }
          formComponent.listingsFormArray.controls.map(listingFormControl => {
            listingFormControl.markAllAsTouched()
          })

          const listingQueries = []

            formComponent.listingsFormArray.controls.filter(listingFormControl => listingFormControl.value.ID != null && listingFormControl.valid && !formComponent.getListingErrors(listingFormControl).invalid).map(listingFormControl => {
              if (!listingFormControl.value.payout) {
                validity = false
              }
              updateRequests.push(
              this._api.updateInventoryListing(listingFormControl.value.ID, {
                ID: listingFormControl.value.ID,
                priceSourceName: listingFormControl.value.priceSourceName,
                priceSourceMargin: listingFormControl.value.priceSourceMargin,
                payout: listingFormControl.value.payout,
                price: listingFormControl.value.price,
                status: listingFormControl.value.status,
              }))
            })


          // added new listing

          const listingsToCreate = formComponent.listingsFormArray.controls.filter(listingFormControl => listingFormControl.valid && listingFormControl.value.ID == null && !formComponent.getListingErrors(listingFormControl).invalid)

          if (listingsToCreate.length > 0) {
            listingQueries.push(this._api.createInventoryListings(inventoryFormData.ID, listingsToCreate.map(newListingForm => {

              return {
                saleChannelID: newListingForm.value.saleChannel.ID,
                accountID: inventoryFormData.accountID,
                inventoryID: inventoryFormData.ID,
                productID: newListingForm.value.product.ID,
                productVariantID: newListingForm.value.variant.ID,
                status: newListingForm.value.status,
                payout: newListingForm.value.payout,
                price: newListingForm.value.price,
                priceSourceName: newListingForm.value.priceSourceName,
                priceSourceMargin: newListingForm.value.priceSourceMargin,
                isActiveListing: newListingForm.value.isActiveListing,
              }
            })))
          }
          forkJoin(listingQueries.length > 0 ? listingQueries : of([]))
            .subscribe(
            () => {
              this._analytics.trackEvent('inventory_update_bulk')
              updateRequests.push(this._api.updateInventory(inventoryFormData.ID, body))
              console.log('number of update requests', updateRequests.length)
            }
          )
        }
      }
    })
    console.log('number of update requests', updateRequests.length)

    if (createRequests.length == 0 && updateRequests.length == 0) {
      this._modalCtrl.warning('No inventory records to create')
      this.isLoadingAction = false
      return
    } else if (!validity) {
      this._modalCtrl.warning('Please fill out all required fields')
      return
    } else {
      this.isLoadingAction = true
      const requests = createRequests.concat(updateRequests)
      if (this._route.snapshot.queryParams.source == "inventoryUploadReminder") {
        requests.push(this._api.createEvent({ resource: 'inventory-upload-reminder', action: EventActionEnum.Completed }))
      }
      forkJoin(requests).subscribe((inventoryRecords: InventoryRecord[]) => {
        this._modalCtrl.success('Inventory Records Updated')
        this.isLoadingAction = false
        //navigate to inventory page if on create else refresh page
        if (this.formType == 'create' && !this.redirect) {
          this._router.navigate(['/inventory'])
        } else if (this.formType == 'create' && this.redirect == 'edit') {
          this._router.navigate([`/inventory/bulk/edit/product/${this.product.ID}`, { queryParams: { formType: 'edit', inventoryType: 'stock' } }])
          this.refreshInventoryRecords()
        }
      })
    }
  }

  // used for mat-select patching when objects are used instead of standard values
  compareObjectsByIDFn(o1: Object, o2: Object): boolean {
    return (o1 && o2 && o1['ID'] == o2['ID'])
  }

  //Navigate to create bulk inventory page
  createInventoryRecords() {
    this._router.navigate([`inventory/bulk/create/product/${this.product.ID}`], { queryParams: { formType: 'create', inventoryType: 'stock', refresh: new Date().getTime() } })
    this.ngOnInit()
  }

  openAddBulkPage() {
    this.formType = 'create';
    this.redirect = 'edit';
    this._router.navigate([`inventory/bulk/create/product/${this.product.ID}`], { queryParams: { formType: 'create', inventoryType: this.inventoryType } })
  }

  onInventoryOptionsClick() {
    const actions = []
    // Add actions
    if (this.user.iam.inventory.create && this.formType !== 'create') {
      actions.push({ icon: 'info', title: 'Add Inventory', description: '', disabled: false, key: 'add-inventory' })
    }
    if (!this.trackCost) {
      actions.push({ icon: 'info', title: 'Show Cost', description: '', disabled: false, key: 'track-cost' })
    } else {
      actions.push({ icon: 'info', title: 'Hide Cost', description: '', disabled: false, key: 'untrack-cost' })
    }
    if (this.user.iam.inventory.create && this.formInventory.length > 1) {
      actions.push({ icon: 'info', title: 'Bulk Edit', description: '', disabled: false, key: 'bulk-edit' })
    }

    this._modalCtrl.actionSheet('Actions', actions).pipe(
      filter((resp: IModalResponse) => resp.role == "submit"),
      map((resp: IModalResponse) => resp.data),
    ).subscribe((action: string) => {
      switch (action) {
        case 'add-inventory':
          this.openAddBulkPage()
          break;
        case 'track-cost':
          this.onTrackCostToggle()
          break;
        case 'untrack-cost':
          this.onTrackCostToggle()
          break;
        case 'bulk-edit':
          this.openBulkEditForm()
          break;
      }
    })
  }

  openBulkEditForm() {
    /**
     * Open the bulk editor
     */
    this._modalCtrl.open(InventoryFormsBulkEditComponent, { fields: this.inventoryType == 'stock' ? ['cost', 'payout', 'status', 'notes', 'priceSourceMargin'] : ['cost', 'payout', 'status', 'notes', 'priceSourceMargin'], statusOptions: ['active', 'drafted'], variants: this.product.variants, inventoryType: this.inventoryType }).pipe(filter(res => res)).subscribe(data => {
      //  Take returned data and remove null props.
      data = Object.entries(data).reduce((accumulator, [key, value]) => {
        if (value !== null) {
          accumulator[key] = value;
        }
        return accumulator;
      }, {});
      //  Patch new data into form.
      const formUpdates = [];
      this.inventoryRecordFormComponents.forEach(formComponent => {
        //  Need to include some kind of variant check here.
        const inventoryForm = formComponent.inventoryForm;
        if (inventoryForm.get('quantity').value > 0) {
          formUpdates.push(data);
          inventoryForm.patchValue(data);
          if (data.priceSourceName && formComponent.formValidationHeaderError !== 'variant-missing-public-price') {
            formComponent.onMarketOracleToggle(true, data.priceSourceMargin)
          }
          formComponent.checkAndUpdateFormState()
        }
        if (formUpdates.length > 0) {
          this._modalCtrl.success(`${formUpdates.length} inventory records updated`)
        }
        else {
          this._modalCtrl.warning('No records updated, add some quantity to the records you want to update')
        }
      });
    })
  }

  get trackCost() {
    let untracked = localStorage.getItem('untrack-cost');
    if (untracked == 'true') {
      return false;
    }
    return true;
  }

  onTrackCostToggle() {
    localStorage.setItem('untrack-cost', this.trackCost ? 'true' : 'false');

  }
}

