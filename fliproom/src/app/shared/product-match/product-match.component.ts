import { Component, Input, OnInit } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { filter, map, mergeMap } from 'rxjs/operators';
import { ApiService } from 'src/app/core/api.service';
import { ProductSearchComponent } from '../components/product-search/product-search.component';
import { Product, ProductMatchLookup, ProductVariant } from '../models/Product.model';
import { IModalResponse, ModalService } from '../modal/modal.service';
import { SaleChannel } from '../models/SaleChannel';
import { ModalController } from '@ionic/angular';

export interface IProductMatch {
  productVariantID: number;
  externalSaleChannelID: number;
}

@Component({
  selector: 'app-product-match',
  templateUrl: './product-match.component.html',
  styleUrls: ['./product-match.component.scss'],
})
export class ProductMatchComponent implements OnInit {
  @Input() data: IProductMatch

  public internalProductVariant: ProductVariant; // store the internal product variant
  public externalSaleChannel: SaleChannel; // store the external sale channel
  public externalProductSelected: Product; // store the selected external product
  public externalProductVariantSelected: ProductVariant; // store the selected external product variant
  public isLoadingAction: boolean = false; // loading state for the save button

  constructor(
    private _api: ApiService,
    private _modalService: ModalService,
    private _modalCtrl: ModalController
  ) { }

  ngOnInit() {
    forkJoin({
      variant: this._api.getVariantByID(this.data.productVariantID),
      saleChannel: this._api.getSaleChannelByID(this.data.externalSaleChannelID)
    })
    .subscribe((data: any) => {
      this.internalProductVariant = data.variant
      this.externalSaleChannel = data.saleChannel
      this.onSelectProduct()
    })
  }

  onSelectProduct() {
    const productSearchModalParams = {}
    if (this.externalSaleChannel.platform == 'laced') {
      productSearchModalParams['catalogueSelected'] = 'laced'
    } else { // external sale channels belonging to other users
      productSearchModalParams['accountID'] = this.externalSaleChannel.accountID
    }

    this._modalService.open(ProductSearchComponent, productSearchModalParams, {cssClass: 'full-screen-y'}).pipe(
      filter((resp) => resp != null),
    )
    .subscribe((product: Product) => {
      this.externalProductSelected = product
      this.onSelectVariant()
    })
  }

  onSelectVariant() {
    const actions = []
    if (this.externalProductSelected.variants.length == 1) {
      this.externalProductVariantSelected = this.externalProductSelected.variants[0]
      return
    } else {
      this.externalProductSelected.variants.map(variant =>
        actions.push({
          icon: 'info',
          title: variant.name,
          description: '',
          disabled: false,
          key: this.externalSaleChannel.platform == 'laced' ? variant.lacedID : variant.ID
        })
      )
    }

    this._modalService.actionSheet('Select Variant', actions).pipe(
      filter((resp: IModalResponse) => resp.role == "submit"),
      map((resp: IModalResponse) => resp.data),
    ).subscribe((productVariantID: number) => {
      this.externalProductVariantSelected = this.externalProductSelected.variants.find(variant => {
        if (this.externalSaleChannel.platform == 'laced') {
          return variant.lacedID == productVariantID
        } else {
          return variant.ID == productVariantID
        }
      })
    })
  }

  onCancel() {
    this._modalCtrl.dismiss()
  }

  onSave() {
    if (!this.externalProductVariantSelected) {
      this._modalService.warning('Please select a variant')
      return
    }
    this.isLoadingAction = true
    if(this.externalSaleChannel.platform === 'laced') {
      const updates = {
        lacedID: this.externalProductSelected.lacedID,
          lacedTitle: this.externalProductSelected.title,
          lacedCode:  this.externalProductSelected.code,
          variants: [{
            ID: this.internalProductVariant.ID,
            lacedID: this.externalProductVariantSelected.lacedID,
            lacedName: this.externalProductVariantSelected.name,
          }]
        }
       this._api.updateProduct(this.internalProductVariant.productID, updates ).subscribe((product) => {
          this._modalCtrl.dismiss(product, 'submit')
       })
    } else {
      this._api.matchProductVariant(this.internalProductVariant.productID, this.internalProductVariant.ID, this.externalProductVariantSelected.ID)
      .subscribe((productMatchLookup: ProductMatchLookup) => {
        this._modalCtrl.dismiss(productMatchLookup, 'submit')
      }, catchError => {this.isLoadingAction = false})
    }


  }

}
