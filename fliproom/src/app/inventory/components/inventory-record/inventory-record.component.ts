import {Component, EventEmitter, Input, OnInit, Output, ViewChild} from '@angular/core';
import { environment } from 'src/environments/environment';
import {Warehouse} from "../../../shared/models/Warehouse.model";
import {SaleChannel} from "../../../shared/models/SaleChannel";
import {Product, ProductVariant} from "../../../shared/models/Product.model";
import {InventoryListing, InventoryRecord} from "../../../shared/models/InventoryRecord";
import {forkJoin, of, Subscription} from "rxjs";
import {AbstractControl, FormArray, FormControl, FormGroup, Validators} from "@angular/forms";
import {ApiService} from "../../../core/api.service";
import {ActivatedRoute, Router} from "@angular/router";
import {IModalResponse, ModalService} from "../../../shared/modal/modal.service";
import {ModalController} from "@ionic/angular";
import {UserService} from "../../../core/user.service";
import {UtilService} from "../../../core/util.service";
import {AnalyticsService} from "../../../core/analytics.service";

import {InventoryRecordFormComponent} from "../inventory-record-form/inventory-record-form.component";
import {filter, map, mergeMap, switchMap} from "rxjs/operators";
import {InventoryRecordItemsComponent} from "../inventory-record-items/inventory-record-items.component";


@Component({
  selector: 'app-inventory-record',
  templateUrl: './inventory-record.component.html',
  styleUrls: ['./inventory-record.component.scss'],
})
export class InventoryRecordComponent implements OnInit {

  @Input() data: {
    inventoryType: string,
    inventoryRecord: InventoryRecord,
    product: Product,
    standalone: boolean
  }

  @ViewChild(InventoryRecordFormComponent) inventoryRecordFormComponent: InventoryRecordFormComponent;


  public environment = environment
  public isLoading: boolean = false; //loading data
  public isLoadingListings: boolean = false
  public isLoadingAction: boolean = false; //loading button
  public availableWarehouses: Warehouse[] = this.user.account.warehouses.filter(wh => wh.fulfillmentCentre)
  public saleChannels: SaleChannel[] = this.user.account.saleChannels
  public availableProductVariants: ProductVariant[] = []
  private _currentQuantity = 0 // store the current quantity for adjustQuantity scenario
  public userAccount: any = this.user.account.name;
  public formOptions: any = [];
  public inventoryType: string ;
  public inventoryRecord: InventoryRecord;
  public product: Product;
  public activeSubs: Subscription[] = []
  public isFormInitialized: boolean = false

  public inventoryForm: FormGroup;


  public inventoryListingsForm = new FormArray([])

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

  ngOnInit() {

    if (this.data.standalone) {

      this.loadInventoryForm(this.data.inventoryRecord)
    }
    else{
      //Initialise vars from data passed to component
      this.inventoryRecord = this.data.inventoryRecord
      this.product = this.data.product
      this.inventoryType = this.data.inventoryType
    }

  }

//load inventory form
loadInventoryForm(inventoryRecord: InventoryRecord){
  this.isLoading = true
  const inventoryRecord$ = inventoryRecord.ID ? this._api.getInventoryByID(inventoryRecord.ID) : of(inventoryRecord)
  inventoryRecord$.pipe(
    switchMap((inventoryRecord: InventoryRecord) => {
      this.inventoryRecord = inventoryRecord
      return this._api.getProduct(inventoryRecord.product.ID)
    }),
  ).subscribe((product) => {
    this.product = product
    this.product.refreshVariantMatches()
    this.inventoryType = this.data.inventoryType
    // After the data is loaded and set in the form, set the form as initialized in next tick
    setTimeout(() => {
      this.isFormInitialized = true
    }, 0)
    this.loadFormOptions()
    this.isLoading = false
  })
}

loadFormOptions(){
  if (this.user.iam.service.warehousing && this.data.inventoryType != 'virtual' && (!(this.inventoryRecord.warehouse?.accountID != this.user.account.ID) || this.inventoryRecord.accountID == this.user.account.ID)){
    this.onPushFormOption({
      title: 'View Items',
      description: '',
      disabled: false,
      key: 'view-items'
    })
  }
}

  ngAfterViewInit() {
    console.log('ngAfterViewInit')
    //add a timeout to ensure the form is initialized before accessing it
     setTimeout(() => {
      //set form as initialized once the form component is loaded
      if (this.inventoryRecordFormComponent) {
        console.log('ngAfterViewInit')
        this.isFormInitialized = true
      }
    }, 0)
  }




  //check if option exists by key on formOptions if not push it
  onPushFormOption(option) {
    if (!this.formOptions.find(opt => opt.key == option.key)) {
      this.formOptions.push(option)
    }
  }

  onBack() {
    this._modalCtrl.dismiss(null, 'submit')
  }


  //TODO: Optional actions on form

  onOptionsClick () {
    this._modal
      .actionSheet('Options', this.formOptions)
      .pipe(
        filter((resp: IModalResponse) => resp.role == "submit"),
        map((resp: IModalResponse) => resp.data),
      )
      .subscribe((action: string) => {
        switch (action) {
          case 'view-items':
            this.onInventoryItemsClick()
            break
        }
      })
  }

  //open item viewer to view items associated to that inventory
  onInventoryItemsClick(){
    //fetch inventory items
    this._modal.open(InventoryRecordItemsComponent, {inventoryID: this.inventoryRecord.ID}, {cssClass: 'full-screen-y'})
      .pipe(filter(res => res), mergeMap(res => {
          this.isLoading = true
          this.isFormInitialized = false
          if (res == 'dismiss') {
            this._modalCtrl.dismiss(this.inventoryRecord, 'submit')
            return of(null)
          }
          return this._api.getInventoryByID(this.inventoryRecord.ID)
        })
      ).pipe(filter((res:any )=> res))
      .subscribe((inventoryRecord: InventoryRecord) => {
        this.inventoryRecord = inventoryRecord
        //this.inventoryRecordFormComponent.loadInventoryForm(this.inventoryRecord)
        this.loadFormOptions()
        this.isLoading = false
        setTimeout(() => {
          this.isFormInitialized = true
        })
      })
  }


  // used for mat-select patching when objects are used instead of standard values
  compareObjectsByIDFn(o1: Object, o2: Object): boolean {
    return (o1 && o2 && o1['ID'] == o2['ID'])
  }

  /**
   * Saving the inventory record
   *
   * Saves the inventory record and dismisses component with the latest version of the inventory form
   */
  onSave() {
    //Doesnt update data only sends the form data back to the parent component
    if(!this.data.standalone){
      this._modalCtrl.dismiss({inventoryRecordForm: this.inventoryRecordFormComponent.inventoryForm, listingsFormArray: this.inventoryRecordFormComponent.inventoryListingsForm}, 'submit')
    }
    else{
      this.updateInventoryRecord()
    }
  }

  updateInventoryRecord(){
    const inventoryRecordForm = this.inventoryRecordFormComponent.inventoryForm;
    const listingsFormArray = this.inventoryRecordFormComponent.listingsFormArray;
    const inventoryFormData = inventoryRecordForm.getRawValue();
    inventoryRecordForm.markAllAsTouched();

    if (inventoryFormData.accountID != this.user.account.ID) {
      if(!this.inventoryRecord.isStatusOnlyUpdated(this.user.account.saleChannels, inventoryFormData, listingsFormArray.controls)) {
        this._modal.info('This is consignor stock. You can only update the status of your listings')
        return
      }
      this.isLoadingAction = true;
      const body = {
        listings: []
      };
      let listingRequests = [];
      listingsFormArray.controls.filter(listingFormControl => listingFormControl.value.ID != null && listingFormControl.value.saleChannel.accountID == this.user.account.ID && listingFormControl.valid && !this.inventoryRecordFormComponent.getListingErrors(listingFormControl).invalid ).map(listingFormControl => {
        listingRequests.push(this._api.updateInventoryListing(listingFormControl.value.ID, {
          ID: listingFormControl.value.ID,
          status: listingFormControl.value.status,
        }
        ))
      })
      this._analytics.trackEvent('inventory_update')
      forkJoin(listingRequests).subscribe( (res) => {
        this._modalCtrl.dismiss(this.inventoryRecord, 'submit')
        this._modal.success('Inventory Updated')
        this.isLoadingAction = false
      })
      return
    }

    if(inventoryRecordForm.valid) {
      this.isLoadingAction = true
      const inventoryFormData = inventoryRecordForm.value
      if (inventoryFormData.ID) {
        this._analytics.trackEvent('inventory_update')
        const body = {
          cost: inventoryFormData.cost,
          notes: inventoryFormData.notes,
          listings: [],
        }

        // Inventory type virtual quantity adjustment
        if (inventoryFormData.virtual) {
          const quantity = inventoryFormData.quantity == 10 ? 10 : 0
          body['adjustQuantity'] = quantity - this.inventoryRecord.quantity
        }
        else {
          // this applies only for accoutns that don't have warehousing service and inventory is not ad another warehouse
          const qtyDelta = inventoryFormData.quantity - this.inventoryRecord.quantity
          if (qtyDelta < 0) {
            body['adjustQuantity'] = qtyDelta
          }
        }
        listingsFormArray.controls.map(listingFormControl => {
          listingFormControl.markAllAsTouched()
        })

        const listingQueries = []
        listingsFormArray.controls.filter(listingFormControl => listingFormControl.value.ID != null && listingFormControl.valid && !this.inventoryRecordFormComponent.getListingErrors(listingFormControl).invalid ).map(listingFormControl => {
            listingQueries.push( this._api.updateInventoryListing(listingFormControl.value.ID, {
              ID: listingFormControl.value.ID,
              priceSourceName: listingFormControl.value.priceSourceName,
              priceSourceMargin: listingFormControl.value.priceSourceMargin,
              payout: listingFormControl.value.payout,
              price:  listingFormControl.value.price,
              status: listingFormControl.value.status,
            }))
          })

        // added new listing

        const listingsToCreate = listingsFormArray.controls.filter(listingFormControl => listingFormControl.valid && listingFormControl.value.ID == null && !this.inventoryRecordFormComponent.getListingErrors(listingFormControl).invalid)
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

        forkJoin(listingQueries.length > 0 ? listingQueries : of(null))
          .pipe(
            mergeMap(() => {
              return this._api.updateInventory(inventoryFormData.ID, body)
            })
        ).subscribe( (inventoryRecord: InventoryRecord) => {
            this._modalCtrl.dismiss(inventoryRecord, 'submit')
            this._modal.success('Inventory Updated')
            this.isLoadingAction = false
          }
        )
      } else {
        this._analytics.trackEvent('inventory_add')
        const warehouse = this.availableWarehouses.length == 1 ? this.availableWarehouses[0] : null; //create inventory records in this warehouse
        const body = {
          accountID: this.user.account.ID,
          // order info
          reference1: inventoryFormData.notes,
          warehouseID: warehouse?.ID,
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
        const queries = this._api.createInventoryListings(inventoryFormData.ID, listingsFormArray.controls.filter(listingForm => listingForm.valid && !this.inventoryRecordFormComponent.getListingErrors(listingForm).invalid).map(listingForm => {
          const listingFormData = listingForm.value
          body.listings.push({
            saleChannelID: listingFormData.saleChannel.ID,
            status: listingFormData.status,
            priceSourceName: listingFormData.priceSourceName,
            priceSourceMargin: listingFormData.priceSourceMargin,
            payout: listingFormData.payout,
            price: listingFormData.price,
            productID: listingFormData.product.ID,
            productVariantID: listingFormData.variant.ID,
            isActiveListing: listingFormData.isActiveListing ?? false,
          })
        }))

        let createdInventoryRecord
        this._api.createInventory(body).pipe(
          switchMap((inventoryRecord) => {
            createdInventoryRecord = inventoryRecord
            return queries
          })
        ).subscribe(() => {
          this._modalCtrl.dismiss(createdInventoryRecord, 'submit')
          this._modal.success('Inventory Created')
          this.isLoadingAction = false
        })
      }
    }
  }

  get trackCost() {
    let untracked = localStorage.getItem('untrack-cost');
    if ( untracked == 'true') {
      return false;
    }
    return true;
  }


}
