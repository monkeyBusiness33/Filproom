import {Component, Input, OnInit} from '@angular/core';
import {FormArray} from "@angular/forms";
import firebase from "firebase/compat";
import {UserService} from "../../../core/user.service";
import {ModalController} from "@ionic/angular";
import {ModalService} from "../../../shared/modal/modal.service";
import {Item} from "../../../shared/models/Item.model";
import {filter, map, mergeMap} from "rxjs/operators";
import {ApiService} from "../../../core/api.service";
import {ActivatedRoute, Router} from "@angular/router";
import { environment } from 'src/environments/environment';

export interface IInventoryRecordItems {
  inventoryID: number,
}
@Component({
  selector: 'app-inventory-record-items',
  templateUrl: './inventory-record-items.component.html',
  styleUrls: ['./inventory-record-items.component.scss'],
})
export class InventoryRecordItemsComponent implements OnInit {

  @Input() data: IInventoryRecordItems

  public inventoryItems: Item[]
  public inventoryID: number
  public environment = environment

  public isLoading = true


  constructor(
    private _user: UserService,
    private _modalCtrl: ModalController,
    private _modal: ModalService,
    private _api: ApiService,
    private _router: Router,
    private _activatedRoute: ActivatedRoute,

  ) { }

  ngOnInit() {
    this.inventoryID = this.data.inventoryID
    this.onRefresh()
  }

  onClose() {
    this._modalCtrl.dismiss('closed', 'submit')
  }

  onOpenActionSheet(item: Item) {
    const actions = [
      {title: 'Delete Item', key: 'delete'},
      {title: 'View Details', key: 'view-details'}
    ]

    this._modal.actionSheet('Actions', actions).pipe(
      filter(res => res.role == "submit"),
      map(res => res.data)
    ).subscribe((action: string) => {
      switch (action) {
        case 'view-details':
          this._modalCtrl.dismiss('dismiss', 'submit')
          this._router.navigate([`/items/${item.ID}`])
          break;

        case 'delete':
          this._modal.confirm(`Delete Item with Barcode ${item.barcode} from the system? This action can't be undone`).pipe(
            filter(res => res)
          ).subscribe(resp => {
            this.isLoading = true
            this._api.deleteInventoryItems(item.inventoryID, {itemID: item.ID}).subscribe(() => {
              this._modal.success(`Item Removed`)
              this.onRefresh()
            })
          })
          break;
      }
    })
  }

  private onRefresh() {
    this._api.getItemsList(0,999,null, {inventoryID: this.inventoryID}).subscribe(res=>{
      this.inventoryItems = (res.data as Item[])
      //close modal if no items left and redirect to product page
      if(this.inventoryItems.length == 0){
        this._modalCtrl.dismiss('dismiss', 'submit')
       // this._router.navigate([url], {queryParams: {inventoryType: inventoryType}})
      }
      this.isLoading = false
    })
  }
}
