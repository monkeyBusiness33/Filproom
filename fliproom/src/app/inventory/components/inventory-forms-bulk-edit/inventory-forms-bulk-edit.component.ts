import { Component, Input, OnInit, ElementRef, ViewChild, inject } from '@angular/core';
import {COMMA, ENTER} from '@angular/cdk/keycodes';
import {ModalController} from "@ionic/angular";
import {FormArray, FormGroup, FormControl} from "@angular/forms";
import {LiveAnnouncer} from '@angular/cdk/a11y';
import {Observable} from 'rxjs';
import {map, startWith} from 'rxjs/operators';
import {MatChipInputEvent} from '@angular/material/chips';
import { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';

import {UserService} from "../../../core/user.service";
import {ModalService} from "../../../shared/modal/modal.service";
import {environment} from 'src/environments/environment';
import { ProductVariant } from 'src/app/shared/models/Product.model';

export interface IBulkEditComponent {
  fields:           Array<string>;
  statusOptions?:   Array<string>;
  variants:         Array<ProductVariant>;
  inventoryType:    String;
}

@Component({
  selector: 'app-inventory-forms-bulk-edit',
  templateUrl: './inventory-forms-bulk-edit.component.html',
  styleUrls: ['./inventory-forms-bulk-edit.component.scss'],
})

export class InventoryFormsBulkEditComponent implements OnInit {

  @Input() data: IBulkEditComponent;
  displayFields: any = {};
  separatorKeysCodes: number[] = [ENTER, COMMA];
  filteredVariants: Observable<string[]>;
  variantCtrl = new FormControl('');
  variants: string[] = [];
  selectedVariants: string[] = [];

  @ViewChild('variantInput') variantInput: ElementRef<HTMLInputElement>;

  announcer = inject(LiveAnnouncer);

  constructor(
    private _user: UserService,
    private _modalCtrl: ModalController,
    private _modal: ModalService,
  ) {
    this.filteredVariants = this.variantCtrl.valueChanges.pipe(
      startWith(null),
      map((variant: string | null) => {
          const filteredByInput = variant ? this._filter(variant) : this.variants.slice();
          return this._excludeSelectedVariants(filteredByInput);
      }),
    );
  }

  public environment = environment;
  public fields: Array<string>
  public statusOptions?: Array<string>
  public inventoryType: String
  public bulkEditForm: FormGroup = new FormGroup({
    quantity: new FormControl(null),
    cost: new FormControl(null),
    payout: new FormControl(null),
    status: new FormControl(null),
    notes: new FormControl(null),
    priceSourceMargin: new FormControl(null),
    // variants: new FormArray([]),
    // variantCtrl: this.variantCtrl,
    // variantControl: new FormControl([]),
  });

  ngOnInit() {
    this.fields = this.data.fields
    // this.variants = this.data.variants.map((variant, index) => {
    //   return variant.name;
    // })
    this.statusOptions = this.data.statusOptions
    //  Toggleable field updates below.
    // this.fields.forEach((field, index) => {
    //   this.bulkEditForm.addControl(`update${field}`, new FormControl(false));
    // });
  }

  ionViewWillEnter() {
    this.inventoryType = this.data.inventoryType
    this.fields.forEach(field => {
      switch (field) {
        case 'quantity':
          this.displayFields.quantity = true;
          break;
        case 'cost':
          this.displayFields.cost = true;
          break;
        case 'payout':
          this.displayFields.payout = true;
          break;
        case 'status':
          this.displayFields.status = true;
          break;
        case 'notes':
          this.displayFields.notes = true;
          break;
        case 'priceSourceMargin':
          this.displayFields.priceSourceMargin = true;
          break;
      }
    });
  }

  onCancel() {
    this._modalCtrl.dismiss('Cancelled');
  }

  onSubmit() {
    const formData = { ...this.bulkEditForm.value };

    //  Filtering out where box not checked.
    // for (let label of this.fields) {
    //   label = label
    //   if (!formData[`update${label}`]) {
    //     delete formData[label];
    //   }
    //  Removing the update flags before returning
    //   delete formData[`update${label}`];
    // }
    if (formData.priceSourceMargin) {
      formData['priceSourceName'] = 'stockx'
    }

    this._modalCtrl.dismiss(formData, 'submit');
  }




  /**
   *  Currently unused. Toggleable fields and variant selection.
   */
  onUpdateLabelToggle(field) {
    this.bulkEditForm.get(`update${field}`)
    .patchValue(this.bulkEditForm.get(`update${field}`).value == null ||
      this.bulkEditForm.get(`update${field}`).value == false ?
      true:false, {emitEvent: true})
  }

  add(event: MatChipInputEvent): void {
    const value = (event.value || '').trim();

    if (!this.variants.includes(value)) {
      return
    }

    // Add our variant
    if (value) {
      this.selectedVariants.push(value);
    }

    // Clear the input value
    event.chipInput!.clear();

    this.variantCtrl.setValue(null);
  }

  remove(variant: string): void {
    const index = this.selectedVariants.indexOf(variant);

    if (index >= 0) {
      this.selectedVariants.splice(index, 1);

      this.announcer.announce(`Removed ${variant}`);
    }
  }

  selected(event: MatAutocompleteSelectedEvent): void {
    this.selectedVariants.push(event.option.viewValue);
    this.variantInput.nativeElement.value = '';
    this.variantCtrl.setValue(null);
  }

  private _filter(value: string): string[] {
    const filterValue = value.toLowerCase();
    return this.variants.filter(variant => variant.toLowerCase().includes(filterValue));
  }

  private _excludeSelectedVariants(variants: string[]): string[] {
    return variants.filter(variant => !this.selectedVariants.includes(variant));
  }

  get trackCost() {
    let untracked = localStorage.getItem('untrack-cost');
    if ( untracked == 'true') {
      return false;
    }
    return true;
  }

}
