import {Component, OnInit, ViewChild, AfterViewInit, ElementRef} from '@angular/core';
import {ApiService} from "../../core/api.service";
import {ActivatedRoute, Router} from "@angular/router";
import {UserService} from "../../core/user.service";
import {InventoryRecord} from "../../shared/models/InventoryRecord";
import {Product, ProductVariant} from "../../shared/models/Product.model";
import {forkJoin} from "rxjs";
import {filter, map} from "rxjs/operators";
import { environment } from 'src/environments/environment';
import {IonBackButtonDelegate, IonSlides, Gesture, GestureController} from '@ionic/angular';
import {Location} from "@angular/common";
import {ModalService} from "../../shared/modal/modal.service";
import {InventoryRecordComponent} from "../components/inventory-record/inventory-record.component";

@Component({
  selector: 'app-inventory-view',
  templateUrl: './inventory-view.component.html',
  styleUrls: ['./inventory-view.component.scss'],
})

/**
 * Inventory View Breakdown
 *
 * This component is responsible for showing inventory available for a certain product
 *
 * - mobile version consists of two steps, selecting variant for product and inventory records available for that variant
 * - web version shares the mobile components but they are all displayed on one page
 *
 * - a variant needs to be selected before being able to see any inventory records
 * - on Inventory Variant component inventory records can be created and edited for both virtual and non-virtual
 */

export class InventoryViewComponent implements OnInit, AfterViewInit {

  @ViewChild('componentSlider')  componentSlider: IonSlides;
  @ViewChild(IonBackButtonDelegate, { static: false }) backButton: IonBackButtonDelegate;


  constructor(
    private _api: ApiService,
    private _router: Router,
    public user: UserService,
    private _route: ActivatedRoute,
    private location: Location,
    private _modalCtrl: ModalService,
    private _elementRef: ElementRef,
    private _gestureCtrl: GestureController
  ) { }

  public environment = environment
  public product: Product
  public inventory: InventoryRecord[]
  public inventoryType: string
  public selectedVariant: ProductVariant
  public filteredInventory: InventoryRecord[]
  public isLoading = false

  //Buttons
  public buttons = []
  // slider configs
  public slideOpts = {
    initialSlide: 0,
    allowSlideNext: false
  };

  ngOnInit() {
    //Add actions to button set based on permissions
    if(this.user.iam.inventory.create){
      this.buttons.push({label: 'add inventory', icon: 'add_box', id: 'add-inventory'} )
    }


    if(this.user.iam.inventory.update){
      this.buttons.push( {label: 'edit inventory', icon: 'app_registration', id: 'bulk-edit'} )
    }


    this.isLoading = true
    const filters = {}
    this.inventoryType = this._route.snapshot.queryParams['inventoryType']
    const productID = Number(this._route.snapshot.paramMap.get('productID'))
    this.inventoryType == 'consignment' ? filters['listings.productID']= productID : filters['productID'] = productID
    forkJoin({
      product: this._api.getProduct(Number(this._route.snapshot.paramMap.get('productID'))),
      inventory: this._api.getInventory(0, 999, 'createdAt:desc',filters )
    }).subscribe((response) => {

      this.isLoading = false
      this.product = response.product
      this.inventory = response.inventory.data


      // if a variant is selected
      if (Number(this._route.snapshot.paramMap.get('variantID'))) {
        this.onVariantChange(this.product.variants.find(_variant => _variant.ID == Number(this._route.snapshot.paramMap.get('variantID'))))
      } else {
        //be sure to be in the product page if on mobile
        if(environment.screenType == 'mobile' ){
          this.componentSlider.slideTo(0)
        }
      }
      // returning from product creation
      if (this._route.snapshot.queryParams.action == 'add-inventory') {
        this.onButtonClick('add-inventory')
      }

      // pre-selected inventory record if coming from web
      const selectedInventoryID = Number(this._route.snapshot.queryParams['inventoryID'])
      if (selectedInventoryID) {
        setTimeout(() => {
          this.onInventoryUpdate(new InventoryRecord({ID: selectedInventoryID}))
        }, 500)
      }

      this.refreshData()
    })
  }

  ngAfterViewInit() {
    const swipeGesture: Gesture = this._gestureCtrl.create({
      el: this._elementRef.nativeElement,
      gestureName: 'swipe-to-dismiss',
      onEnd: ev => {
        if (ev.deltaX > 0) {
          this.componentSlider.getActiveIndex().then(index => {
            if(index == 1){
              this.componentSlider.slidePrev()
            }
            else{
              this.location.back()
            }
          })
        }
      }
    });

    swipeGesture.enable();
  }

  ionViewWillEnter() {
  }

  ionViewDidEnter() {
    // back button override logic
    this.setUIBackButtonAction();
  }

  onVariantChange(variant: ProductVariant){
    // on variant selection
    this.selectedVariant = variant
    let url = `inventory/product/${variant.productID}/variants/${variant.ID}`
    if (this.inventoryType) {
      url += `?inventoryType=${this.inventoryType}`
    }
    this.location.replaceState(url);

    if(this.componentSlider && environment.screenType == 'mobile' ){
      this.componentSlider.lockSwipeToNext(false).then(()=>{
        this.componentSlider.slideNext()
      })
    }
    this.filterInventory()

  }

  onInventoryTypeChange(inventoryType: string){
    this.inventoryType = inventoryType
    this.refreshData()
  }

  refreshData(){
    this.isLoading = true
    const filters = {}
    // fetch inventory for selected product
    this.inventoryType == 'consignment' ? filters['listings.productID']= this.product.ID : filters['productID'] = this.product.ID
    this._api.getInventory(0, 999, 'createdAt:desc', filters).subscribe( (res) => {
      this.isLoading = false
      this.inventory = res.data
      if(this.selectedVariant){
        this.filterInventory()
      }
    })
  }

  setUIBackButtonAction() {
    this.backButton.onClick = () => {
      if(environment.screenType == "mobile"){
        this.componentSlider.getActiveIndex().then(index => {
          if(index == 1){
            this.componentSlider.slidePrev()
          }
          else{
            this.location.back()
          }
        })
      }
      else {
        this.location.back()
      }
    };
  }

  filterInventory(){
    this.filteredInventory = this.inventory.filter(_inv => {
      if (this.inventoryType == 'stock' && !_inv.virtual  && _inv.variant.ID == this.selectedVariant.ID && _inv.accountID == this.user.account.ID){
        return true
      }
      else if(this.inventoryType == 'virtual'&& _inv.virtual && _inv.variant.ID == this.selectedVariant.ID ) {
        return true
      }
      else if(this.inventoryType == 'consignment'&& !_inv.virtual && _inv.listings[0].productVariantID == this.selectedVariant.ID && _inv.accountID != this.user.account.ID ) {
          return true
      } else {
        return false
      }
    })
  }

  //Button click logic
  onButtonClick(buttonId: string) {

    if(buttonId == 'add-inventory'){
      //check if account has virtual inventory available and prompt bulk-add option
      if(this.user.iam.inventory.virtual){
        const actions = [
          {title: 'Physical', key: 'physical-inventory'},
          {title: 'Virtual', key: 'virtual-inventory'}
        ]
        this._modalCtrl.actionSheet('Inventory Type', actions).pipe(
          filter(res => res.role == "submit"),
          map(res => res.data)
        ).subscribe((action: string) => {
          switch (action) {
            case 'physical-inventory':
              this._router.navigate([`inventory/bulk/create/product/${this.product.ID}`], {queryParams: { formType: 'create', inventoryType: 'stock'}})
              break;
            case 'virtual-inventory':
              this._router.navigate([`inventory/bulk/create/product/${this.product.ID}`], {queryParams: { formType: 'create', inventoryType: 'virtual'}})
              break;
          }
        })
      }
      else {
        this._router.navigate([`inventory/bulk/create/product/${this.product.ID}`], {queryParams: { formType: 'create', inventoryType: 'stock' }})
      }
    }
    else if(buttonId == 'bulk-edit'){
      const queryParams = {
        inventoryType: this.inventoryType,
        formType: "edit",
      }
      let url =  `inventory/bulk/edit/product/${this.product.ID}`
      this._router.navigate([url], {queryParams})


    }
  }

  //Inventory Update
  onInventoryUpdate(inventoryRecord: InventoryRecord) {
    let data = {
      product: this.product,
      //variant: this.selectedVariant,
      inventoryType: this.inventoryType,
      inventoryRecord: inventoryRecord,
      standalone: true
    }
    this._modalCtrl.open(InventoryRecordComponent, data, {cssClass: 'full-screen-y'}).pipe(filter((data)=> data)).subscribe((res)=> this.refreshData())
    //this._modalCtrl.open(InventoryFormComponent, data, {cssClass: 'full-screen-y'}).pipe(filter((data)=> data)).subscribe((res)=> this.refreshData())
  }


}
