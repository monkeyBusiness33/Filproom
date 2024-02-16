import { Component, Input, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ModalController } from '@ionic/angular';
import { forkJoin, of } from 'rxjs';
import { filter, map, mergeMap } from 'rxjs/operators';
import { ApiService } from 'src/app/core/api.service';
import { UserService } from 'src/app/core/user.service';
import { IModalResponse, ModalService } from 'src/app/shared/modal/modal.service';
import { RevolutBalance, StripeBalance, Transaction } from 'src/app/shared/models/Transaction.model';
import { Item } from 'src/app/shared/models/Item.model';
import { environment } from 'src/environments/environment';

export interface IPaymentForm {
  txId: number
}

@Component({
  selector: 'app-payout-form',
  templateUrl: './payout-form.component.html',
  styleUrls: ['./payout-form.component.scss'],
})
export class PayoutFormComponent implements OnInit {
  /**
   * This component takes in a txId and displays the transaction information.
   *
   * In case the tx is a payout and the user accessing it is the retailer account, he can pay the consignor from here.
   *
   * methods:
   * - ngOnIt
   *      - we get the tx information, and if applicable, the item information to computeItemStatus.
   *      - Also, we fetch unpaid cancellation fees for this consignor. If any available are appended to the unpaid payout during oayment
   *      - If the user is the retailer, we fetch the stripe balance and revolut balances to display the available balances during payment
   * - computeItemStatus - used only for consigned items. used to display if the item has been shipped to the fulfillment center, authenticated or shipped to the customer
   * - totalDuePayout    - in the scneairo where the tx is an unpaid payout and there are unpaid cancellation fees, this function displays the actual amount to pay to the consignor
   * - pay               - upon pay button clicked, if the user has permissions, we submit the payment request to the payment provider selected: manual, stripe, revolut and append any cancellation fees
   *
   */
  @Input() data: IPaymentForm;
  public isLoading = false
  public stripeBalance: StripeBalance;
  public revolutBalance: RevolutBalance;
  public paymentMethodsAvailable: string[] = ['manual']
  public transaction: Transaction;
  public itemStatusLog = {
    'consignor-accepted': {
      label: 'Accepted',
      completedAt: null,
      message: 'Item is pending acceptance by consignor'
    },
    'consignor-fulfilled': {
      label: 'Consignor Fulfilled',
      completedAt: null,
      message: 'Item is pending fulfillment by consignor'
    },
    'authenticated': {
      label: 'Authenticated',
      completedAt: null,
      message: 'Item is pending authentication'
    },
    'dispatched': {
      label: 'Dispatched',
      completedAt: null,
      message: 'Item is pending fulfillment'
    },
  } // set this if item belongs to a consignor. used to keep track of the consignor fulfillment to know when to pay the consignor
  public actionButtons = []

  public payoutForm = new FormGroup({
    paymentMethod: new FormControl(null, Validators.required),
    reference: new FormControl(null),
  })

  public unpaidCancellationFees: Transaction[] = [] // stores the unpaid cancellation fees to this consignor. Show if the payout hasn't been paid yet

  constructor(
    public user: UserService,
    private _api: ApiService,
    private _modalService: ModalService,
    private _modalCtrl: ModalController,
    private _router: Router
  ) { }

  ngOnInit() {
    this.isLoading = true

    this._api.getTransactionByID(this.data.txId)
    .pipe(
      mergeMap((tx: Transaction) => {
        this.transaction = tx
        return forkJoin({
          item: this.transaction.orderLineItem.itemID ? this._api.getItemByID(this.transaction.orderLineItem.itemID) : of(null),
          unpaidCancellationFees: this._api.getTransactionsList(0, 100, null, {fromAccountID: this.transaction.toAccountID, type: 'cancellation fee', status: 'unpaid'}),
          consignorInfo: this.transaction.type == "payout" ? this._api.getConsignorInfo(this.transaction.toAccountID) : of(null),
          stripeBalance:   (this.user.account.ID == this.transaction.fromAccountID && this.transaction.type == "payout") ? this._api.getStripeBalance(this.user.account.ID) : of(null),
          revolutBalances: (this.user.account.ID == this.transaction.fromAccountID && this.transaction.type == "payout") ? this._api.getRevolutBalances(this.user.account.ID) : of([]),
        })
      })
    )
    .subscribe(responses => {
      const item = responses.item as (Item | null)
      this.unpaidCancellationFees = responses.unpaidCancellationFees.data as Transaction[]
      this.stripeBalance = responses.stripeBalance as StripeBalance
      //hardcoded accountId selected for edit ldn. Repace with proper logic once another client uses revolut
      if (this.user.account.ID == 3 && environment.name == "production") {
        this.revolutBalance = (responses.revolutBalances as RevolutBalance[]).find(rb => rb.id == "11ff7118-f9bd-4d09-9d4d-932414fd35f7")
      } else {
        this.revolutBalance = (responses.revolutBalances as RevolutBalance[]).find(rb => rb.currency.toLowerCase() == this.transaction.currency.toLowerCase())
      }

      //if account destination has stripe - add stripe to payment methods
      if (this.user.account.stripeAccountID && this.transaction.toAccount.defaultStripeDestinationID) {
        this.paymentMethodsAvailable.push('stripe')
      }

      // if consignor setup revolut - add revolut to payment methods
      if (responses.consignorInfo?.revolutCounterpartyID) {
        this.paymentMethodsAvailable.push('revolut')
      }

      // allow user to see its stripe account if any
      if (this.user.account.stripeAccountID) {
        this.actionButtons.push({label: 'View My Stripe Account', icon: '', id: 'view-stripe-account'})
      }

      if (item) {
        this.computeItemStatus(item)
      }

      const patchValues = {
        reference: this.transaction.reference,
        paymentMethod: this.transaction.gateway
      }

      if (this.paymentMethodsAvailable.length == 1) {
        patchValues['paymentMethod'] = this.paymentMethodsAvailable[0]
      }

      this.payoutForm.patchValue(patchValues)
      this.isLoading = false
    })
  }

  onViewOrder() {
    this.onCancel()
    this._router.navigate(['/orders', this.transaction.order.ID])
  }

  computeItemStatus(item: Item) {
    const consignorOutboundOrderLineItem = item.orders.find(o => o.typeID == 4 && o.accountID == item.accountID).orderLineItems[0]

    if (consignorOutboundOrderLineItem.acceptedAt) {
      this.itemStatusLog['consignor-accepted'].completedAt = consignorOutboundOrderLineItem.acceptedAt
    }

    if (consignorOutboundOrderLineItem.dispatchedAt) {
      this.itemStatusLog['consignor-fulfilled'].completedAt = consignorOutboundOrderLineItem.dispatchedAt
    }

    if (consignorOutboundOrderLineItem.deliveredAt) {
      this.itemStatusLog['authenticated'].completedAt = consignorOutboundOrderLineItem.deliveredAt
    }

    if (this.transaction.orderLineItem.dispatchedAt) {
      this.itemStatusLog['dispatched'].completedAt = this.transaction.orderLineItem.dispatchedAt
    }
  }

  onOpenActionSheet() {
    const actionSheetButtons = []
    if (this.transaction.stripeID) {
      actionSheetButtons.push({title: 'View Payout on Stripe', key: 'view-payout-on-stripe'})
    }

    if (this.user.account.stripeAccountID) {
      actionSheetButtons.push({title: 'View Stripe Account', key: 'view-stripe-account'})
    }

    this._modalService.actionSheet('Actions', actionSheetButtons)
    .pipe(
      filter((resp: IModalResponse) => resp.role == "submit"),
      map((resp: IModalResponse) => resp.data),
    )
    .subscribe((action: string) => {
      if (action == 'view-payout-on-stripe') {
        window.open(`https://dashboard.stripe.com/${this.transaction.toAccount.stripeAccountID}/payouts/${this.transaction.stripeID}`, "_blank");
      }
      if (action == 'view-stripe-account') {
        window.open(`https://dashboard.stripe.com/${this.user.account.stripeAccountID}`, "_blank");
      }
    })
  }

  get totalDuePayout(): number {
    const cancellationFeesTotal = this.unpaidCancellationFees.reduce((acc, tx) => acc + tx.grossAmount, 0)
    return this.transaction.grossAmount - cancellationFeesTotal
  }

  pay() {
    if (!this.user.iam.transaction.pay) {
      this._modalService.warning(`You don't have the permissions to generate payments`)
      return
    }

    this.payoutForm.markAllAsTouched()
    if (this.payoutForm.valid) {
      this.isLoading = true

      let updateRefReq = of(this.transaction)
      if (this.payoutFormData.reference != this.transaction.reference) {
        updateRefReq = this._api.updateTransaction(this.transaction.ID, {reference: this.payoutFormData.reference})
      }

      updateRefReq.pipe(
        mergeMap(() => this._api.payTransactionId(this.transaction.ID, {
          gateway: this.payoutFormData.paymentMethod,
          cancellationFeeTxIds: this.unpaidCancellationFees.map(tx => tx.ID)
        }))
      )
      .subscribe((tx: Transaction) => {
        this.isLoading = false
        this._modalService.success('Payment Generated')
        this.payoutForm.reset()
        this.ngOnInit()
      })
    }
  }

  onCancel() {
    this._modalCtrl.dismiss(null, 'submit');
  }

  get payoutFormData() {
    return this.payoutForm.getRawValue()
  }

}
