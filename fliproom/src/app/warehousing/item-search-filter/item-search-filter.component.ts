import { Component, Input, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { UserService } from 'src/app/core/user.service';
import { Warehouse } from 'src/app/shared/models/Warehouse.model';

export interface IItemSearchFilter {
}

@Component({
  selector: 'app-item-search-filter',
  templateUrl: './item-search-filter.component.html',
  styleUrls: ['./item-search-filter.component.scss'],
})
export class ItemSearchFilterComponent implements OnInit {
  @Input() data: IItemSearchFilter

  public warehousesAvailable: Warehouse[] = [new Warehouse({ID: null, name: 'all'})]

  public filterForm = new FormGroup({
    'product.code':       new FormControl(null),
    'product.title':      new FormControl(null),
    'variant.name':    new FormControl(null),
    'account.name':    new FormControl(null),
    'warehouseID':     new FormControl(null),
  })

  constructor(
    private _modalCtrl: ModalController,
    private _user: UserService
  ) { }

  ngOnInit() {
    if (localStorage.getItem('item-search-filter-query')) {
      this.filterForm.patchValue(JSON.parse(localStorage.getItem('item-search-filter-query')))
    }

    this.warehousesAvailable = this.warehousesAvailable.concat(this._user.account.warehouses) 

    if (this._user.account.warehouses.length == 1) {
      this.filterForm.patchValue({
        'warehouseID': this._user.account.warehouses[0].ID
      })
    }
  }

  onCancel() {
    this._modalCtrl.dismiss();
  }

  onClear() {
    this.filterForm.patchValue({
      'product.code': null,
      'product.title': null,
      'variant.name': null,
      'account.name': null
    })

  }

  onSearchClick() {
    const latestSearch = {}

    // extract filters applied
    for (var key in this.filterForm.value) {
      let value = this.filterForm.value[key]
      if (key == "warehouseID" && value == null) {
        value = this._user.account.warehouses.map((wh: Warehouse) => wh.ID).join(',')
      }

      if (key == "warehouseID") {
        latestSearch[key] = value
        continue
      }

      if (value == null) continue

      if (value != "*" && value != "!*") { //don;t apply ~ to operators * or !*
        value = `~${value}`
      }

      latestSearch[key] = value
    }

    localStorage.setItem('item-search-filter-query', JSON.stringify(this.filterForm.value))
    this._modalCtrl.dismiss(latestSearch, 'submit');
  }

}
