import { Component, Input, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { ModalService } from 'src/app/shared/modal/modal.service';
import {UserService} from "../../../core/user.service";

export interface CheckoutReviewResponse {

}

@Component({
  selector: 'app-checkout-payment-review',
  templateUrl: './checkout-payment-review.component.html',
  styleUrls: ['./checkout-payment-review.component.scss'],
})
export class CheckoutPaymentReviewComponent implements OnInit {
  @Input() data;

  public items: number = 0
  public subtotal: number = 0;
  public taxAmount: number = 0;
  public total: number = 0;
  public shippingCost: number = 0;
  public discount: number = 0;
  public paymentMethodSelected: string;
  public setAsDelivered: boolean;



  constructor(
    private _modalCtrl: ModalController,
    private _modalService: ModalService,
    public user: UserService
  ) { }

  ngOnInit() {
    this.shippingCost = this.data.shippingCost
    this.discount = this.data.discount
    this.items = this.data.items.length
    this.total = this.data.items.reduce((total, item) => total += item.price, 0)
    this.taxAmount = this.total * ((this.data.saleChannel?.taxRate || 0) / 100)
    this.subtotal = this.total - this.taxAmount
    this.setAsDelivered = this.data.setAsDelivered
    //add shipping cost if any to total
    this.total += this.shippingCost
  }

  onPaymentMethodSelected(methodName: string) {
    this.paymentMethodSelected = methodName
  }

  onCancel() {
    this._modalCtrl.dismiss();
  }

  onSubmit() {
    //TODO: manage properly the payment method acccording to the user role
    if (!this.paymentMethodSelected ) {
      this._modalService.warning('Please select a payment method before proceeding')
      return
    }

    this._modalCtrl.dismiss({paymentMethodSelected:this.paymentMethodSelected, setAsDelivered: this.setAsDelivered }, 'submit');
  }

  setAsDeliveredChange(checked: boolean) {
    this.setAsDelivered = checked
  }
}
