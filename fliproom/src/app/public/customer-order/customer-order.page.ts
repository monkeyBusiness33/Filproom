import { Component, OnInit } from '@angular/core';
import { environment } from 'src/environments/environment';
import {ApiService} from "../../core/api.service";
import {ActivatedRoute, Router} from "@angular/router";
import {ModalService} from "../../shared/modal/modal.service";
import {Order} from "../../shared/models/Order.model";
import {of} from "rxjs";
import {map, switchMap} from "rxjs/operators";
import {UserService} from "../../core/user.service";

@Component({
  selector: 'app-customer-order',
  templateUrl: './customer-order.page.html',
  styleUrls: ['./customer-order.page.scss'],
})
export class CustomerOrderPage implements OnInit {

  public environment = environment
  public accessToken: string;
  public orderID: number;
  public sessionID: string;
  public guestJWT: string;
  public order :Order
  public orderMode: string; // 'view' | 'checkout'


  constructor(
    private _api: ApiService,
    private _route: ActivatedRoute,
    private _modalCtrl: ModalService,
    private _router: Router,
    private user: UserService,
  ) { }

  ngOnInit() {

    /**
     * Extracting query parameters and route parameters to determine the order page mode
     * 1. Get accessToken and sessionID from the query parameters
     * 2. Convert orderID from route parameters to a numeric value
     * 3. Retrieve a guest user authentication token using the accessToken
     * 4. Fetch the order object using the obtained guest JWT token
     * 5. If a sessionID is present, retrieve the checkout session information
     * 6. Determine the order page mode based on the session status and order transactions
     *   - If the session is complete, set the mode to 'view'
     *   - If the session is not complete or no session exists, check order transactions
     *   to set the mode to 'checkout' if an unpaid sale transaction is found
     * 7. The resulting orderMode variable is used to conditionally handle the display
     *   and functionality of the order page in either 'view' or 'checkout' mode.
     */

    //get accessToken from query params
    this.accessToken = this._route.snapshot.queryParamMap.get('accessToken')
    this.sessionID = this._route.snapshot.queryParamMap.get('sessionID')
    this.orderID = Number(this._route.snapshot.paramMap.get('orderID'))

    this.refreshData()


  }

  refreshData() {
    //Retrieve guest user
    this._api.getGuestAuthToken(this.accessToken, 'order').pipe(
      //Get order object
      switchMap((res) => {
        this.guestJWT = res.jwtToken
        return this._api.getOrderByID(this.orderID, res.jwtToken)
      }),
      // Get sessionID if present
      switchMap((order: Order) => {
        this.order = order
        if(this.sessionID){
          return this._api.getCheckoutSession(this.order.ID,this.sessionID, 'stripe',this.guestJWT)
        }
        else{
          return of(null)
        }
      }),
      // Handle order page mode
    ).subscribe(
      (session) => {
        //If session is present, check if it is complete (customer has been redirected back to order page after payment)
        if(session){
          if(session.status == 'complete'){
            this.orderMode = 'view';
            this.socketTemporaryPatch()

          }
          else{
            this.orderMode = 'checkout';
          }
        }
        else {
          this.orderMode = 'view';
          for (let transaction of this.order.transactions) {
            if (transaction.type == 'sale' && transaction.status != 'paid' && transaction.status != 'processing') {
              this.orderMode = 'checkout';
              break; // Exit the loop once you find a match
            }
          }

        }
      }
    )
  }

  //TODO: Remove this temporary patch once the socket is implemented
  socketTemporaryPatch() {
    //wait 30 seconds and then refetch order
    setTimeout(() => {
      this._api.getOrderByID(this.order.ID, this.guestJWT).subscribe((order: Order) => {
        console.log('order updated')
        this.order = order
      })
    }
    , 30000)
  }
}


