import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {Product, ProductVariant} from "../../../shared/models/Product.model";
import {InventoryRecord} from "../../../shared/models/InventoryRecord";
import {UserService} from "../../../core/user.service";

@Component({
  selector: 'app-inventory-product',
  templateUrl: './inventory-product.component.html',
  styleUrls: ['./inventory-product.component.scss'],
})
export class InventoryProductComponent implements OnInit {
  public tabs= ['stock']
  constructor(
    public user: UserService,
  ) { }

  @Input() product: Product
  @Input() inventory: InventoryRecord[]
  @Input() selectedVariant: ProductVariant
  @Input() inventoryType: string
  @Output() selectedVariantChange = new EventEmitter<object>();
  @Output() inventoryTypeChange = new EventEmitter<object>();


  ngOnInit() {
    if(this.user.iam.inventory.virtual && !this.user.account.isConsignor){
      this.tabs.push('virtual')
    }

    if (this.user.iam.service.consignment) {
      this.tabs.push('consignment')
    }
  }

  onSegmentChanged(evt){
    this.inventoryType = evt.detail.value
    this.inventoryTypeChange.emit({value: this.inventoryType})
  }

  onVariantSelected(variant: ProductVariant){
    this.selectedVariant = variant
    this.selectedVariantChange.emit({variant: variant})
  }

  getVariantQty(variant: ProductVariant): number {
    return this.inventory.filter(inv => {
      if (this.inventoryType == 'virtual'){
        return inv.productVariantID == variant.ID && inv.virtual
      }
      else if (this.inventoryType == 'stock') {
        return inv.productVariantID == variant.ID && !inv.virtual &&  inv.accountID == this.user.account.ID
      }
      else if (this.inventoryType == 'consignment') {
        return inv.listings[0].productVariantID == variant.ID && !inv.virtual &&  inv.accountID != this.user.account.ID
      } else {
        return false
      }
    }).reduce((tot, inv) => tot += inv.quantity, 0)
  }

  get filteredInventory(): InventoryRecord[] {
    return this.inventory.filter(inv => {
      if (this.inventoryType == 'virtual'){
        return inv.virtual
      }
      else if (this.inventoryType == 'stock') {
        return !inv.virtual &&  inv.accountID == this.user.account.ID
      }
      else if (this.inventoryType == 'consignment') {
        return !inv.virtual &&  inv.accountID != this.user.account.ID
      } else {
        return false
      }
    })
  }

  getTotalQty(): number {
    return this.filteredInventory.reduce((acu, inv) => acu + inv.quantity, 0)
  }

  getTotalCosts(): number {
    return this.filteredInventory.reduce((acu, inv) => acu + (inv.cost ?? 0) * inv.quantity, 0)
  }
}
