import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from 'src/app/core/api.service';
import { UserService } from 'src/app/core/user.service';
import { ModalService } from 'src/app/shared/modal/modal.service';
import { Item } from 'src/app/shared/models/Item.model';
import { Order } from 'src/app/shared/models/Order.model';

@Component({
  selector: 'app-create',
  templateUrl: './create.page.html',
  styleUrls: ['./create.page.scss'],
  encapsulation: ViewEncapsulation.None
})
export class CreatePage implements OnInit {
  public isLoading: boolean = false;
  public currentStepName = 'header';
  public transferHeaderForm = new FormGroup({
    origin: new FormControl(null, Validators.required),
    destination: new FormControl(null, Validators.required),
    reference1: new FormControl(null),
  })
  public transferDetailsList: Item[] = []

  constructor(
    public user: UserService,
    private _api: ApiService,
    private _modalCtrl: ModalService,
    private _router: Router
  ) { }

  ngOnInit() {
  }

  ionViewWillLeave() {
    this.transferHeaderForm.reset()
    this.transferDetailsList = []
    this.currentStepName = 'header'
  }

  get transferHeaderFormData() {
    return this.transferHeaderForm.getRawValue()
  }

  onHeaderCompleted() {
    this.transferDetailsList = [] // clean basket if moving from  header to details
    this.currentStepName = 'details'
  }

  onDetailsBack() {
    this.currentStepName = 'header'
  }

  onDetailsCompleted() {
    this.currentStepName = 'review'
  }

  onReviewBack() {
    this.currentStepName = 'details'
  }

  onTransferConfirmed() {
    this.isLoading = true;

    const body = {
      accountID: this.user.account.ID,
      reference1: this.transferHeaderFormData.reference1,
      type: 'transfer',
      consignorID: this.transferHeaderFormData.origin.addressID,
      consigneeID: this.transferHeaderFormData.destination.addressID,
      details: this.transferDetailsList.map((item: Item) => {return {itemID: item.ID}})
    }

    this._api.createTransferOrder(body).subscribe((order : Order) => {
      this.isLoading = false
      this._modalCtrl.success('Transfer Order Created')
      this._router.navigate([`/transfers/${order.ID}`])
    })
  }

}
