import { Component, Inject, Input, OnInit } from '@angular/core'
import {FormArray, FormControl, FormGroup, Validators} from '@angular/forms'
import { MAT_DIALOG_DATA } from '@angular/material/dialog'
import { ModalController } from '@ionic/angular'
import { ApiService } from 'src/app/core/api.service'
import { ModalService } from 'src/app/shared/modal/modal.service'
import { MarketplaceListing } from 'src/app/shared/models/MarketplaceList'
import { Product } from 'src/app/shared/models/Product.model'
import { environment } from 'src/environments/environment'
import {filter} from "rxjs/operators";
import {CometchatService} from "../../core/cometchat.service";
import {UserService} from "../../core/user.service";

@Component({
  selector: 'marketplace-listing-form',
  templateUrl: './marketplace-listing-form.component.html',
  styleUrls: ['./marketplace-listing-form.component.scss']
})
export class MarketplaceAddListingFormComponent implements OnInit {
  @Input('data') data: Product

  public isLoadingForm = false
  public isLoadingUpdate = false
  public formMode = 'create' // edit, create
  public listingType = 'wts' // stock, virtual
  public selectedProduct: Product

  public environment = environment
  public isLoading: boolean = false

  public marketListingForm = new FormGroup({
    variant: new FormControl(null,[Validators.required] ),
    quantity: new FormControl(null, [Validators.required]),
    price: new FormControl(null, [Validators.required]),
    receipt:  new FormControl(false, [Validators.required]),
    purchasedFrom:  new FormControl(null),
    notes: new FormControl(),
    tags: new FormControl([]),
    type: new FormControl('wtb', [Validators.required])
  })

  constructor (
    private _api: ApiService,
    private _user: UserService,
    private _modal: ModalService,
    private _modalCtrl: ModalController,
    private _cometChat: CometchatService,

  ) {}

  ngOnInit (): void {
    this.selectedProduct = this.data
  }

  selectType (type) {
      this.marketListingForm.get('type').setValue(type)
  }

  onSubmit () {
    this.marketListingForm.markAllAsTouched()
    if (this.marketListingForm.valid){
      //comet chat account creation if needed
      this._cometChat.createUser(this._user)
      let listItem = this.marketListingForm.value
      this.isLoading = true
      const payload = {
        ...listItem,
        productID: this.selectedProduct.ID,
        productVariantID: this.marketListingForm.get('variant').value.ID,
      }
      this._api.addMarketplaceListing(payload).subscribe((marketplaceListing: MarketplaceListing) => {
        this.isLoading = false
        this._modal.success('Item Listing added successfully')
        this._modalCtrl.dismiss(marketplaceListing, 'submit')
      })
    }
  }

  onClose () {
    this._modalCtrl.dismiss()
  }

  // used for mat-select patching when objects are used instead of standard values
  compareObjectsByIDFn(o1: Object, o2: Object): boolean {
    return (o1 && o2 && o1['ID'] == o2['ID'])
  }


  removeTag(tag: any) {
    const tags =  this.tags
    const index = this.tags.indexOf(tag)
    tags.splice(index, 1)
    this.marketListingForm.get('tags').setValue(tags)
  }

  addTag(tag: string) {
    //check if tag has been added already
    const parsedTag = tag.trim()
    if (this.tags.indexOf(parsedTag) != -1){
      this._modal.info('This tag has already been added!')
    }
    else {
      const newTags = this.tags
      newTags.push(parsedTag)
      this.marketListingForm.get('tags').setValue((newTags))
    }

  }

  openTagInput(){
    this._modal.input({
      title: 'Add New Tag',
      subtitle: '',
      type: 'string',
      input: null
    }).pipe(filter(res => res)).subscribe((tag: string) => {
      this.addTag(tag)
    })
  }

  get tags() : string[]{
    return this.marketListingForm.get('tags').value
  }
  get formVal(){
    return this.marketListingForm.value
  }
}
