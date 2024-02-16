import { Component, Input, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { ApiService } from 'src/app/core/api.service';
import { UserService } from 'src/app/core/user.service';
import { ModalService } from 'src/app/shared/modal/modal.service';
import { Transaction } from 'src/app/shared/models/Transaction.model';

export interface ITransactionForm {
  currency: string
  type: string
  orderID: number
  fromAccountID?: number
  toAccountID?: number
  orderLineItemID?: number
}

@Component({
  selector: 'app-transaction-form',
  templateUrl: './transaction-form.component.html',
  styleUrls: ['./transaction-form.component.scss'],
})
export class TransactionFormComponent implements OnInit {
  @Input() data: ITransactionForm;
  public isLoading = false;
  public paymentMethodsAvailable: string[] = ['cash', 'bank']

  public txForm = new FormGroup({
    accountID: new FormControl(this.user.account.ID, Validators.required),
    grossAmount: new FormControl(null, Validators.required),
    setAsPaid: new FormControl(false, Validators.required),
    reference: new FormControl(null),
    paymentMethod: new FormControl(null),

    currency: new FormControl(null, Validators.required),
    type: new FormControl(null, Validators.required),
    orderID: new FormControl(null, Validators.required),
    fromAccountID: new FormControl(null),
    toAccountID: new FormControl(null),
    orderLineItemID: new FormControl(null),
  })

  constructor(
    public user: UserService,
    private _api: ApiService,
    private _modalService: ModalService,
    private _modalCtrl: ModalController
  ) { }

  ngOnInit() {
    this.txForm.patchValue(this.data)
  }

  onCreate() {
    this.txForm.markAllAsTouched()
    if (this.txForm.valid) {
      this.isLoading = true

      //process form to submit reques
      let txsRequest = this.txForm.value
      txsRequest['status'] = txsRequest.setAsPaid ? 'paid' : 'unpaid'

      this._api.createTransactions(txsRequest)
      .subscribe((txs: Transaction[]) => {
        this.isLoading = false
        this._modalService.success('Transaction Generated')
        this._modalCtrl.dismiss(txs, 'submit');
      })
    }
  }

  onCancel() {
    this._modalCtrl.dismiss(null, 'submit');
  }

  get txFormData() {
    return this.txForm.getRawValue()
  }
}
