import {Component, Input, OnInit} from '@angular/core';
import {ApiService} from "../../../core/api.service";
import {ActivatedRoute, Router} from "@angular/router";
import {ModalService} from "../../../shared/modal/modal.service";
import {loadStripe, Stripe, StripeEmbeddedCheckout} from "@stripe/stripe-js";
import { environment } from 'src/environments/environment';
import {from} from "rxjs";
import {switchMap} from "rxjs/operators";
import {Order} from "../../../shared/models/Order.model";
import {ModalController} from "@ionic/angular";
export interface CheckoutContainerData {
  order?: Order;
  guestJWT?: string;
}
@Component({
  selector: 'app-checkout-container',
  templateUrl: './checkout-container.component.html',
  styleUrls: ['./checkout-container.component.scss'],
})
export class CheckoutContainerComponent implements OnInit {

  constructor(
    private _api: ApiService,
    private _route: ActivatedRoute,
    private _modalCtrl: ModalService,
    private _modal: ModalController,
    private _router: Router
  ) { }

  @Input() data: CheckoutContainerData

  public order: Order;
  public guestJWT: string;
  public checkout: StripeEmbeddedCheckout;
  private stripe: Stripe | null = null;
  public environment = environment;

  /**
   * TESTING
   *
   * 4242424242424242 - success
   * 4000000000003220 - Authentication required
   * 4000000000000002 - Card declined
   * */

  ngOnInit() {

  }


  ionViewWillEnter() {

    this.order = this.data.order;
    this.guestJWT = this.data.guestJWT;
    from(loadStripe(this.environment.stripe.publicKey))
      .pipe(
        switchMap(stripe => {
          this.stripe = stripe;
          return this._api.createCheckoutSession(this.order.ID, this.guestJWT, 'stripe')
        }),
        switchMap((response) => {
          if (!this.stripe) {
            throw new Error('Stripe has not initialized');
          }
          return from(this.stripe.initEmbeddedCheckout({ clientSecret: response.client_secret}));
        })
      )
      .subscribe({
        next: checkout => {
          this.checkout = checkout;
          checkout.mount('#checkout')
        },
        error: error => console.error('Error:', error)
      });
  }

  ionViewWillLeave() {
    // Stripe checkout cleanup - needs to be destroyed for new checkout to be mounted if modal has been dismissed previously
    this.checkout.destroy()
  }

  onBack() {
    this._modal.dismiss()
  }
}
