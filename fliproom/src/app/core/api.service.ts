import { Injectable } from '@angular/core'
import {Observable, from, of} from 'rxjs'
import {HttpClient, HttpHeaders, HttpParams} from '@angular/common/http'
import { environment } from 'src/environments/environment'
import { Account, UserService } from './user.service'
import { filter, map, mergeMap, tap, switchMap } from 'rxjs/operators'
import { Order, OrderLineItem } from '../shared/models/Order.model'
import { Product, ProductCategory, ProductMatchLookup, ProductVariant } from '../shared/models/Product.model'
import { RevolutBalance, StripeBalance, Transaction } from '../shared/models/Transaction.model'
import { Item } from '../shared/models/Item.model'
import { Courier, Fulfillment } from '../shared/models/Fulfillment.model'
import { User } from '../shared/models/User.model'
import { UtilService } from './util.service'
import { MarketplaceOffer, MarketplaceOfferInterface } from '../shared/models/MarketplaceOffer'
import { Address } from '../shared/models//Address.model'
import {Job, JobLineItem} from "../shared/models/Job.model";
import { Warehouse } from '../shared/models/Warehouse.model'
import { MarketplaceListing, MarketplaceListInterface } from '../shared/models/MarketplaceList'
import {InventoryRecord, InventoryListing, ListingBidSuggestion} from '../shared/models/InventoryRecord'
import { SaleChannel, TransactionRate } from '../shared/models/SaleChannel'
import { ReportMetadata } from '../shared/models/ReportMetadata'

export interface ApiListResponse {
  count: number
  data: Object[]
}

export interface QueryResponse {
  rows: Object[]
  count: number
}

export interface StatusResponse {
  status: number
  message: string
}

export interface GooglePlaceAutocompletePrediction {
  description: string
  place_id: string
  types: string[]
}

export interface GooglePlace {
  address_components: GooglePlaceAddressComponent[]
}

export interface GooglePlaceAddressComponent {
  long_name: string
  short_name: string
  types: string[]
}

export interface SystemInfo {
  appVersion: string
  allowAccess: boolean
}

export interface MyOffers {
  sentOffers: MarketplaceOffer[],
  receivedOffers: MarketplaceOffer[]
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private JWTOKENNAME = 'fliproom-jwt';

  constructor (
    private _http: HttpClient,
    private _user: UserService,
    private utils: UtilService
  ) {}

  forgotPassword (email: string): Observable<StatusResponse> {
    return this._http.post<StatusResponse>(environment.apiUrl + 'auth/forgot-password', {email: email})
  }

  //Guest Access Token Retrieval
  getGuestAuthToken (accessToken: string, resource:string): Observable<any> {
    return this._http.post<any>(environment.apiUrl + 'auth/guest-access-token', {accessToken: accessToken, resource: resource})
  }

  getSystemInfo (): Observable<SystemInfo> {
    return this._http
      .get<any>(environment.apiUrl + `status?at=${(new Date()).getTime()}`)
  }

  // added no-cache header to request because if server returns 304 (cached response) it triggers an error on the platform
  getAccountInfo (): Observable<UserService> {
    return this._http
      .get<any>(environment.apiUrl + 'api/user/session', {headers: {'Cache-Control': 'no-cache'}})
      .pipe(map(user => this._user.deserialize(user)))
  }

  //reprecated - TODOL: should be removed as well as all of its occurences
  refreshJWTToken (): Observable<any> {
    return this._http.post<any>(environment.apiUrl + 'auth/token/refresh', {
      token: localStorage.getItem(this.JWTOKENNAME)
    })
  }

  loadCountries() {
    return this._http.get('assets/countryList.json')
  }

  loadIntegrationFaqs() {
    return this._http.get('assets/integrationFaqs.json')
  }

  googleAddressAutocomplete(params, jwt=null): Observable<GooglePlaceAutocompletePrediction[]> {
    // Creating httpOptions with conditional Authorization header
    const httpOptions = jwt ? {headers: new HttpHeaders({ 'Authorization': `Bearer ${jwt}`})} : {};
    return this._http.get<GooglePlaceAutocompletePrediction[]>(environment.apiUrl + `api/address/google/autocomplete`, {params: params, headers: httpOptions.headers})
  }

  googlePlace(id: string, jwt= null): Observable<GooglePlace> {
    // Creating httpOptions with conditional Authorization header
    const httpOptions = jwt ? {headers: new HttpHeaders({ 'Authorization': `Bearer ${jwt}`})} : {};
    return this._http.get<GooglePlace>(environment.apiUrl + `api/address/google/${id}`, httpOptions)
  }

  submitTask(taskname: string, data: Object) {
    return this._http.post(environment.apiUrl + `api/workflows/submit-task/${taskname}`, data)
  }

  trackEvent(data: Object) {
    return this._http.post(environment.apiUrl + `api/analytics/event`, data)
  }

  /**
   * orders/
   */

  createCheckoutSession(orderID, accessToken, gateway): Observable<any> {
    // Prepare the headers
    const httpOptions = {
      headers: new HttpHeaders({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      })
    };
    return this._http.post<any>(environment.apiUrl + `api/order/${orderID}/checkout-session`, {gateway}, httpOptions)
  }

  getCheckoutSession(orderID, sessionID, gateway, jwt): Observable<any> {
    let params = new HttpParams()
    params = params.set('sessionID', sessionID)
    params = params.set('gateway', gateway)
    const httpOptions = {
      headers: new HttpHeaders({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`
      })
    };
    return this._http.get<any>(
      environment.apiUrl + `api/order/${orderID}/checkout-session`,
      { params: params, headers: httpOptions.headers }
    );

  }

  getOrderByID (orderID: number, jwt =null): Observable<Order> {
    const httpOptions = jwt? {headers: new HttpHeaders({'Authorization': `Bearer ${jwt}`})} : {};
    return this._http
      .get<Order>(environment.apiUrl + `api/order/${orderID}`, httpOptions)
      .pipe(
        filter(order => order != null),
        map(order => new Order(order))
      )
  }

  getOrderTransactions(orderID: number): Observable<Transaction[]> {
    return this._http
      .get<Transaction[]>(environment.apiUrl + `api/order/${orderID}/transactions`)
      .pipe(
        map(txs => txs.map(tx => new Transaction(tx)))
      )
  }

  getFulfillmentByID (orderID: number, fulfillmentID: number): Observable<Fulfillment> {
    return this._http
      .get<Fulfillment>(environment.apiUrl + `api/order/${orderID}/fulfillments/${fulfillmentID}`)
      .pipe(
        filter(fulfillment => fulfillment != null),
        map(fulfillment => new Fulfillment(fulfillment))
      )
  }

  getFulfillmentShippingLabel (orderID: number, fulfillmentID: number): Observable<any> {
    return this._http.get<any>(environment.apiUrl + `api/order/${orderID}/fulfillments/${fulfillmentID}/shipping-label`)
  }

  createSaleOrder (body): Observable<Order> {
    return this._http.post<Order>(environment.apiUrl + 'api/order/sale-order', body)
    .pipe(
      map(order => new Order(order))
    )
  }

  createTransferOrder (body): Observable<Order> {
    return this._http.post<Order>(environment.apiUrl + 'api/order/transfer', body)
    .pipe(
      map(order => new Order(order))
    )
  }

  getOrders (pageIdx: number, pageSize: number, sort: string = null, filters) {
    let params = this.utils.buildParams(pageIdx, pageSize, sort, filters)

    return this._http
      .get<QueryResponse>(environment.apiUrl + 'api/order', { params })
      .pipe(
        map((_response: QueryResponse) => {
          return {
            data: _response.rows.map(order => new Order(order)),
            count: _response.count
          }
        })
      )
  }

  updateOrder(orderID: number, updates: Object, jwt = null) {
    // Creating httpOptions with conditional Authorization header
    const httpOptions = jwt ? {headers: new HttpHeaders({ 'Authorization': `Bearer ${jwt}`})} : {};
    console.log(updates)
    // Passing httpOptions to the put request
    return this._http.put<Order>(environment.apiUrl + `api/order/${orderID}`, updates, httpOptions).pipe(
      map(order => new Order(order))
    );
  }

  updateOrderLineItem (orderID: number, orderLineItemID: number, updates) {
    return this._http.put<string>(
      environment.apiUrl + `api/order/${orderID}/order-line-item/${orderLineItemID}`,
      updates
    )
  }

  downloadTransfer(body): Observable<string> {
    return this._http.post<string>(environment.apiUrl + `api/order/transfer/download`, body)
  }

  downloadOrder(body): Observable<string> {
    return this._http.post<string>(environment.apiUrl + `api/order/download`, body)
  }

  acceptOrder (orderID: number, orderLineItems: Object) {
    return this._http
      .post<Order>(environment.apiUrl + `api/order/${orderID}/accept`, {
        orderID: orderID,
        orderLineItems: orderLineItems
      })
      .pipe(map(order => new Order(order)))
  }

  cancelOrder (orderID: number, body: Object) {
    return this._http
      .post<Order>(environment.apiUrl + `api/order/${orderID}/cancel`, body)
      .pipe(map(order => new Order(order)))
  }

  replaceOrder (orderID: number, body: Object) {
    return this._http
      .post<Order>(environment.apiUrl + `api/order/${orderID}/replace`, body)
      .pipe(map(order => new Order(order)))
  }

  downloadReceipt (orderID: number): Observable<Object> {
    return this._http.get<Object>(environment.apiUrl + `api/order/${orderID}/download/receipt?refresh=true`)
  }

  downloadInvoice(orderID: number): Observable<Object> {
    return this._http.get<Object>(environment.apiUrl + `api/order/${orderID}/download/invoice`)
  }

  downloadCustomerInvoice(orderID: number): Observable<Object> {
    return this._http.get<Object>(environment.apiUrl + `api/order/${orderID}/download/customerInvoice`)
  }

  getAvailableCouriers(orderID: number): Observable<Courier[]> {
    return this._http.get<Courier[]>(environment.apiUrl + `api/order/${orderID}/couriers-available`).pipe(
      map(couriers => couriers.map(courier => new Courier(courier)))
    )
  }

  createFulfillment (orderID: number, body): Observable<Fulfillment> {
    return this._http.post<Fulfillment>(
      environment.apiUrl + `api/order/${orderID}/fulfillments`,
      body
    )
  }

  updateFulfillment (orderID: number, fulfillmentID: number, updates): Observable<Fulfillment> {
    return this._http.put<Fulfillment>(
      environment.apiUrl + `api/order/${orderID}/fulfillments/${fulfillmentID}`,
      updates
    )
  }

  fulfillmentDispatch (
    orderID: number,
    fulfillmentID: number,
    orderLineItems
  ): Observable<Fulfillment> {
    return this._http.post<Fulfillment>(
      environment.apiUrl + `api/order/${orderID}/fulfillments/${fulfillmentID}/dispatch`,
      {
        fulfillmentID: fulfillmentID,
        orderLineItems: orderLineItems
      }
    )
  }

  fulfillmentDeliver (
    orderID: number,
    fulfillmentID: number,
    orderLineItems
  ): Observable<Fulfillment> {
    return this._http.post<Fulfillment>(
      environment.apiUrl + `api/order/${orderID}/fulfillments/${fulfillmentID}/deliver`,
      {
        fulfillmentID: fulfillmentID,
        orderLineItems: orderLineItems
      }
    )
  }

  /**
   * order-line-item
   */

  getOrderLineItemByID (oliID: number): Observable<OrderLineItem> {
    return this._http
      .get<Order>(environment.apiUrl + `api/order-line-item/${oliID}`)
      .pipe(
        filter(oli => oli != null),
        map(oli => new OrderLineItem(oli))
      )
  }

  getOrderLineItems (pageIdx: number, pageSize: number, sort: string = null, filters) {
    let params = this.utils.buildParams(pageIdx, pageSize, sort, filters)

    return this._http
      .get<QueryResponse>(environment.apiUrl + 'api/order-line-item', { params })
      .pipe(
        map((_response: QueryResponse) => {
          return {
            data: _response.rows.map(oli => new OrderLineItem(oli)),
            count: _response.count
          }
        })
      )
  }

  /**
   * ADDRESS/
   */

  validateAddress(rawAddress, jwt = null) {
    // Creating httpOptions with conditional Authorization header
    const httpOptions = jwt ? {headers: new HttpHeaders({ 'Authorization': `Bearer ${jwt}`})} : {};
    return  this._http.post<{ validated: boolean; error?: string }>(environment.apiUrl + 'api/address/validate', rawAddress, httpOptions)
  }

  createAddress(body, jwt = null): Observable<Address> {
    // Creating httpOptions with conditional Authorization header
    const httpOptions = jwt ? {headers: new HttpHeaders({ 'Authorization': `Bearer ${jwt}`})} : {};
    return this._http.post<Address>(environment.apiUrl + 'api/address', body, httpOptions).pipe(
      map(consignee => new Address(consignee))
    )
  }

  updateAddress(customerID: number, updates,  jwt=null): Observable<Address> {

    // Creating httpOptions with conditional Authorization header
    const httpOptions = jwt ? {headers: new HttpHeaders({ 'Authorization': `Bearer ${jwt}`})} : {};

    return this._http.put<Address>(environment.apiUrl +  `api/address/${customerID}`, updates, httpOptions).pipe(
      map(consignee => new Address(consignee))
    )
  }


  getAddressList (
    pageIdx: number,
    pageSize: number,
    sort: string = null,
    filters
  ) {
    let query;
    if (filters.search && environment.name != "local") {
      let searchParams = {
        offset: pageIdx * pageSize,
        limit: pageSize,
      }

      if (sort) {
        searchParams['sort'] = sort
      }
      for (var filterKey in filters) {
        if (filters[filterKey] == null) {
          searchParams[filterKey] = `!*`
        } else {
          searchParams[filterKey] = `${filters[filterKey]}`
        }
      }
      query = this._http.post<QueryResponse>(environment.apiUrl + 'api/address/search', searchParams)
    } else {
      let params = this.utils.buildParams(pageIdx, pageSize, sort, filters)
      query = this._http
      .get<QueryResponse>(environment.apiUrl + 'api/address', {
        params: params
      })
    }

    return query.pipe(
      map((_response: QueryResponse) => {
        return {
          data: _response.rows.map(address =>
            new Address(address)
          ),
          count: _response.count
        }
      })
    )
  }

  /**
   * fulfillment/
   */
   getFulfillments (pageIdx: number, pageSize: number, sort: string = null, filters) {
    let params = this.utils.buildParams(pageIdx, pageSize, sort, filters)

    return this._http
      .get<QueryResponse>(environment.apiUrl + 'api/fulfillment', { params })
      .pipe(
        map((_response: QueryResponse) => {
          return {
            data: _response.rows.map(fulfillment => new Fulfillment(fulfillment)),
            count: _response.count
          }
        })
      )
  }

  /**
   * transaction
   */
  getTransactionByID (txId: number): Observable<Transaction> {
    return this._http
      .get<Transaction>(environment.apiUrl + `api/transactions/${txId}`)
      .pipe(
        map(fulfillment => new Transaction(fulfillment))
      )
  }

  getTransactionsList (pageIdx: number, pageSize: number, sort: string = null, filters) {
    let params = this.utils.buildParams(pageIdx, pageSize, sort, filters)

    return this._http
      .get<QueryResponse>(environment.apiUrl + 'api/transactions', { params })
      .pipe(
        map((_response: QueryResponse) => {
          return {
            data: _response.rows.map(tx => new Transaction(tx)),
            count: _response.count
          }
        })
      )
  }

  createTransactions (body): Observable<Transaction[]> {
    return this._http
      .post<Transaction[]>(environment.apiUrl + `api/transactions/`, body)
      .pipe(
        map(txs => txs.map(tx => new Transaction(tx)))
      )
  }

  updateTransaction (txId: number, updates): Observable<Transaction> {
    return this._http
      .put<Transaction>(environment.apiUrl + `api/transactions/${txId}`, updates)
      .pipe(
        map(tx => new Transaction(tx))
      )
  }

  payTransactionId (txId: number, body): Observable<Transaction> {
    return this._http
      .post<Transaction>(environment.apiUrl + `api/transactions/${txId}/pay`, body)
      .pipe(
        map(fulfillment => new Transaction(fulfillment))
      )
  }

  downloadTransaction (body): Observable<string> {
    return this._http.post<string>(environment.apiUrl + `api/transactions/download`, body)
  }

  /**
   * item/
   */

  getItemByID (itemID: number): Observable<Item> {
    return this._http
      .get<Item>(environment.apiUrl + `api/item/${itemID}`)
      .pipe(map(item => new Item(item)))
  }

  getItemsList (
    pageIdx: number,
    pageSize: number,
    sort: string = null,
    filters
  ): Observable<ApiListResponse> {
    let params = this.utils.buildParams(pageIdx, pageSize, sort, filters)

    return this._http
      .get<QueryResponse>(environment.apiUrl + 'api/item', { params })
      .pipe(
        map((_response: QueryResponse) => {
          return {
            data: _response.rows.map(stockItem =>
              new Item(stockItem)
            ),
            count: _response.count
          }
        })
      )
  }

  updateItem (itemID: number, updates) {
    return this._http.put<string>(
      environment.apiUrl + `api/item/${itemID}`,
      updates
    )
  }

  downloadItem(body): Observable<string> {
    return this._http.post<string>(environment.apiUrl + `api/item/download`, body)
  }

  /**
   * JOBS
   */

  getJobs(pageIdx: number, pageSize: number, sort: string = null, filters) {
    let params = this.utils.buildParams(pageIdx, pageSize, sort, filters)

    if (sort) {
      params = params.set('sort', `${sort}`)
    }

    for (var filterKey in filters) {
      params = params.set(filterKey, `${filters[filterKey]}`)
    }

    return this._http.get<QueryResponse>(environment.apiUrl + 'api/job', {params}).pipe(
      map((_response: QueryResponse) => {
        return {
          data: _response.rows.map(job => new Job(job)),
          count: _response.count
        }
      })
    );
  }

  getJobLineItems(pageIdx: number, pageSize: number, sort: string = null, filters) {
    let params = this.utils.buildParams(pageIdx, pageSize, sort, filters)

    return this._http.get<QueryResponse>(environment.apiUrl + 'api/job-line-item', {params}).pipe(
      map((_response: QueryResponse) => {
        return {
          data: _response.rows.map(job => new JobLineItem(job)),
          count: _response.count
        }
      })
    );
  }

  createJob(body): Observable<Job> {
    return this._http.post<Job>(environment.apiUrl + 'api/job', body);
  }

  getJob(jobID: number) : Observable<Job>{
    return this._http.get<Job>(environment.apiUrl + `api/job/${jobID}`).pipe(
      filter(job => job != null),
      map(job => new Job(job))
    );
  }

  completeJob(jobID: number) {
    return this._http.put<string>(
      environment.apiUrl + `api/job/${jobID}/complete`,{}
    )
  }

  createJobLineItem(body): Observable<JobLineItem> {
    return this._http.post<JobLineItem>(environment.apiUrl + 'api/job-line-item', body);
  }

  getJobLineItem(jobLineItemID: number) : Observable<JobLineItem>{
    return this._http.get<Job>(environment.apiUrl + `api/job-line-item/${jobLineItemID}`).pipe(
      filter(jobLineItem => jobLineItem != null),
      map(jobLineItem => new JobLineItem(jobLineItem))
    );
  }
  updateJobLineItem(jobLineItemID: number, updates) {
    return this._http.put<string>(
      environment.apiUrl + `api/job-line-item/${jobLineItemID}`,
      updates
    );
  }


  /**
   *
   * PRODUCTS
   */

  getProductsList (
    pageIdx: number,
    pageSize: number,
    sort: string = null,
    filters
  ) {
    let query;
    if (filters.search && !filters.catalogue && environment.name != "local") {
      let searchParams = {
        offset: pageIdx * pageSize,
        limit: pageSize,
      }

      if (sort) {
        searchParams['sort'] = sort
      }
      for (var filterKey in filters) {
        if (filters[filterKey] == null) {
          searchParams[filterKey] = `!*`
        } else {
          searchParams[filterKey] = `${filters[filterKey]}`
        }
      }
      query = this._http.post<QueryResponse>(environment.apiUrl + 'api/product/search', searchParams)
    } else {
      let params = this.utils.buildParams(pageIdx, pageSize, sort, filters)
      query = this._http
      .get<QueryResponse>(environment.apiUrl + 'api/product', {
        params: params
      })
    }
    return query.pipe(
        map((_response: QueryResponse) => {
          return {
            data: _response.rows.map(product =>
              new Product(product)
            ),
            count: _response.count
          }
        })
      )
  }


  getVariantsList (pageIdx: number, pageSize: number, sort: string = null, filters) {
    let params = this.utils.buildParams(pageIdx, pageSize, sort, filters)
    return this._http.get<QueryResponse>(environment.apiUrl + 'api/product/variants/all', {params: params}).pipe(
        map((_response: QueryResponse) => {
          return {
            data: _response.rows.map(variant => new ProductVariant(variant)),
            count: _response.count
          }
        })
      )
  }

  downloadProduct(body): Observable<string> {
    return this._http.post<string>(environment.apiUrl + `api/product/download`, body)
  }

  getVariantByID (variantID: number): Observable<ProductVariant> {
    return this._http
      .get<ProductVariant>(environment.apiUrl + `api/product/variant/${variantID}`)
      .pipe(map(variant => new ProductVariant(variant)))
  }

  getProductsCategories (
    pageIdx: number,
    pageSize: number,
    sort: string | null,
    filters
  ) : Observable<{ data: ProductCategory[]; count: number }> {
    let params = this.utils.buildParams(pageIdx, pageSize, sort, filters)
    return this._http
      .get<QueryResponse>(environment.apiUrl + 'api/product-categories', {
        params: params
      })
      .pipe(
        map((_response: QueryResponse) => {
          return {
            data: _response.rows.map(productCategory =>
              new ProductCategory(productCategory)
            ),
            count: _response.count
          }
        })
      )
  }

  getVariantMatch(variantID: number): Observable<ProductVariant> {
    return this._http.get<ProductVariant[]>(environment.apiUrl + `api/product/variants/${variantID}/match`).pipe(
      map(variant => new ProductVariant(variant))
    )
  }

  importProduct(externalProductID: number): Observable<Product> {
    const body = {productID: externalProductID}
    return this._http.post<Product>(environment.apiUrl + `api/product/import`, body).pipe(
      map(product => new Product(product))
    );
  }


  matchProductVariant(productID: number, productVariantID: number, externalProductVariantID: number = null): Observable<ProductMatchLookup> {
    const body = {
      externalProductVariantID: externalProductVariantID
    }

    return this._http.post<ProductMatchLookup>(environment.apiUrl + `api/product/${productID}/variants/${productVariantID}/match`, body).pipe(
      map(matchRecord => new ProductMatchLookup(matchRecord))
    );
  }

  getProduct (productID: number) : Observable<Product> {
    return this._http
      .get<Product>(environment.apiUrl + `api/product/${productID}`)
      .pipe(map(product => new Product(product)))
  }

  createProduct (body): Observable<Product> {
    const images: Array<File | Object> = body.images || body.sourceProduct.images;
    const imagePromises = images.map(image => {
      if (image instanceof File) {
        return getImageAsBase(image);
      } else {
        return Promise.resolve(image);
      }
    });

    return from(Promise.all(imagePromises)).pipe(
      tap(processedImages => {
        body.images = processedImages.map((image, index) =>
          typeof image === 'string' ? { base64: image, position: index } : image
        );
      }),
      switchMap(() => this._http.post<Product>(environment.apiUrl + 'api/product', body)),
      map(product => new Product(product))
    );
  }

  updateProduct(productID: number, updates: Object): Observable<Product> {
    return this._http.put<Product>(environment.apiUrl + `api/product/${productID}`, updates).pipe(
      map(product => new Product(product))
    );
  }

  updateVariants(productID: number, updates: Object) {
    return this._http.put<any>(
      environment.apiUrl + `api/product/${productID}/variants`,
      updates
    )
  }

  deleteVariants(productID: number, deletions: Array<number>) {
    const variantIDs = deletions.join(',');
    return this._http.delete<any>(
      environment.apiUrl + `api/product/${productID}/variants?variantIDs=${variantIDs}`
    )
  }

  createVariants(productID: number, variants: Object) {
    return this._http.post<any>(
      environment.apiUrl + `api/product/${productID}/variants`,
      {variants: variants}
    )
  }

  createProductImages(productID: number, images: Object | Object[]) {
    let imagesArray = Array.isArray(images) ? images : [images];
    const imageData = {
      images: imagesArray.map((image, index) => {
        if (isBase(image['src'])) {
          return { src: image['src'], position: image['position']}
        } else {
          return { base64: image['src'], position: image['position']}
        }
      })
    };
    return this._http.post<any>(
      environment.apiUrl + `api/product/${productID}/images`,
      imageData
    )
  }

  updateProductImages(productID: number, updates: Object) {
    return this._http.put<any>(
      environment.apiUrl + `api/product/${productID}/images`,
      { images: updates }
    )
  }

  deleteProductImages(productID: number, deletions: Array<number>) {
    const imageIDs = deletions.join(',');
    return this._http.delete<any>(
      environment.apiUrl + `api/product/${productID}/images?imageIDs=${imageIDs}`
    )
  }

  /**
   * warehouses/
   */
  getWarehousesList(pageIdx: number, pageSize: number, sort: string = null, filters) {
    let params = this.utils.buildParams(pageIdx, pageSize, sort, filters)

    return this._http.get<QueryResponse>(environment.apiUrl + 'api/warehouse', {params}).pipe(
      map((_response: QueryResponse) => {
        return {
          data: _response.rows.map(wh => new Warehouse(wh)),
          count: _response.count
        }
      })
    );
  }

  createWarehouse (body): Observable<Warehouse> {
    return this._http.post<Warehouse>(environment.apiUrl + `api/warehouse`, body).pipe(
      map(warehouse => new Warehouse(warehouse))
    )
  }

  updateWarehouse (warehouseID: number, updates): Observable<Warehouse> {
    return this._http.put<Warehouse>(environment.apiUrl + `api/warehouse/${warehouseID}`, updates).pipe(
      map(warehouse => new Warehouse(warehouse))
    )
  }


  /**
   *
   * accounts/
   */

  updateAccount (ID: number, updates): Observable<any> {
    return this._http.put<any>(environment.apiUrl + `api/account/${ID}`, updates)
  }

  deleteAccount (ID: number): Observable<any> {
    return this._http.delete<any>(environment.apiUrl + `api/account/${ID}`)
  }

  getAccountUsers (pageIdx: number, pageSize: number, sort: string = null, filters) {
    let params = this.utils.buildParams(pageIdx, pageSize, sort, filters)

    return this._http.get<any>(environment.apiUrl + `api/account/${filters.accountID}/users`, {params}).pipe(
      map((_response: QueryResponse) => {
        return {
          data: _response.rows.map(user => new User(user)),
          count: _response.count
        }
      })
    )
  }

  generateItemsBarcodes (quantity: number) {
    return this._http.get<any>(
      environment.apiUrl + `api/account/${this._user.account.ID}/item-barcodes`,
      {
        params: { quantity: quantity.toString() },
        responseType: 'arraybuffer' as 'json',
        headers: { Accept: 'application/pdf' }
      }
    )
  }

  addPermissions (permissions: string[]): Observable<any> {
    return this._http.post<any>(environment.apiUrl + `api/user/${this._user.ID}/permissions/add`, {permissions: permissions})
  }

  removePermissions (permissions: string[]): Observable<any> {
    return this._http.post<any>(environment.apiUrl + `api/user/${this._user.ID}/permissions/delete`, {permissions: permissions})
  }

  getConsignorInfo (consignorAccountID: number): Observable<any> {
    return this._http.get<any>(environment.apiUrl + `api/account/${this._user.account.ID}/consignor/${consignorAccountID}`)
  }

  getConsignmentInfo(accountID:number, consignorAccountID: number): Observable<any> {
    return this._http.get<any>(environment.apiUrl + `api/account/${accountID}/consignor/${consignorAccountID}`)
  }

  downloadConsignor(body): Observable<string> {
    return this._http.post<string>(environment.apiUrl + `api/account/download`, body)
  }

  getRevolutBalances (accountID: number): Observable<any> {
    return this._http
      .get<any>(environment.apiUrl + `api/account/${accountID}/revolut/balance`)
      .pipe(
        map(rbalances => (rbalances || []).map(rb => new RevolutBalance(rb))))
  }

  getStripeAccount (accountID): Observable<any> {
    return this._http.get<any>(environment.apiUrl + `api/account/${accountID}/stripe/account`)
  }

  getStripeBalance (accountID: number): Observable<any> {
    return this._http
      .get<any>(environment.apiUrl + `api/account/${accountID}/stripe/balance`)
      .pipe(
        map(balanceResp => new StripeBalance(balanceResp)))
  }

  getStripeLinks (accountID: number, linkName: string, params): Observable<string> {
    return this._http.get<string>(environment.apiUrl + `api/account/${accountID}/stripe/links/${linkName}`,
      {
        params: params
      }
    )
  }

  createBankAccount(accountID: number, consignorAccountID: number, body): Observable<any> {
    return this._http.post<any>(environment.apiUrl + `api/account/${accountID}/consignor/${consignorAccountID}/bank-details`, body)
  }

  getBankAccount(accountID: number, consignorAccountID: number, counterpartyID: number): Observable<any> {
    return this._http.get<any>(environment.apiUrl + `api/account/${accountID}/consignor/${consignorAccountID}/bank-details/${counterpartyID}`)
  }

  removeBankAccount(accountID: number, consignorAccountID: number): Observable<any> {
    return this._http.delete<any>(environment.apiUrl + `api/account/${accountID}/consignor/${consignorAccountID}/bank-details?gateway=revolut`)
  }

  /**
   *
   * users
   */
  updateUser (userID: number, updates): Observable<any> {
    return this._http.put<any>(environment.apiUrl + `api/user/${userID}`, updates)
  }

  refreshAPIKey (userID: number): Observable<any> {
    return this._http.post<any>(environment.apiUrl + `api/user/${userID}/api-key/refresh`, {})
  }

  getAccountAnalytics(accountID: number, analyticsName: string, params) {
    return this._http.get<any>(environment.apiUrl + `api/account/${accountID}/analytics/${analyticsName}`, {params: params})
  }


  getAccountReports(accountID: number, params = {}) {
    return this._http.get<any>(environment.apiUrl + `api/account/${accountID}/reports`, { params }).pipe(
      map(data => data.map(report => new ReportMetadata(report)))
    )
  }

  getReportByID(reportID: number) {
    return this._http.get<any>(environment.apiUrl + `api/account/${this._user.account.ID}/reports/${reportID}`)
  }

  /**
   *
   * Events
   *
   */

  getAllEvents(pageIdx: number, pageSize: number, sort: string, filters) {
    let params = this.utils.buildParams(pageIdx, pageSize, sort, filters)
    return this._http.get<any>(environment.apiUrl + `api/events/`, { params });
  }

  getEventById(eventId: string) {
    return this._http.get<any>(environment.apiUrl + `api/events/${eventId}`)
  }

  createEvent(body: Object) {
    return this._http.post<any>(environment.apiUrl + `api/events`, body)
  }

  /**
   *
   * marketplace
   *
   */
  getMarketplaceListings (
    pageIdx: number,
    pageSize: number,
    sort: string | null,
    filters,
    groupBy: string[] | null = null
  ): Observable<any> {
    let params = this.utils.buildParams(pageIdx, pageSize, sort, filters)

    if (groupBy) {
      params = params.set('groupBy', groupBy.join(','))
    }

    return this._http
      .get<QueryResponse>(environment.apiUrl + `api/marketplace`, { params })
      .pipe(
        map(resp => {
          return {
            count: resp.count,
            data: resp.rows.map(row => new MarketplaceListing(row))
          }
        })
      )
  }





  // Marketplace Listing
  getMarketplaceListingDetail (ID: string): Observable<MarketplaceListing> {
    return this._http
      .get<MarketplaceListing>(environment.apiUrl + `api/marketplace/listing/${ID}`)
      .pipe( map(resp => new MarketplaceListing(resp)))
  }

  addMarketplaceListing (payload: MarketplaceListInterface): Observable<MarketplaceListing> {
    return this._http
      .post<MarketplaceListing>(environment.apiUrl + `api/marketplace`, payload)
      .pipe( map(resp => new MarketplaceListing(resp)) )
  }

  downloadMarketPlace(body): Observable<string> {
    return this._http.post<string>(environment.apiUrl + `api/marketplace/download`, body)
  }

  deleteMarketplaceListing (ID: string | number): Observable<any> {
    return this._http.delete<any>(environment.apiUrl + `api/marketplace/${ID}`)
  }

  // Marketplace Offers
  addMarketplaceListingOffer (payload: MarketplaceOfferInterface): Observable<MarketplaceOffer> {
    return this._http
      .post<MarketplaceOffer>(environment.apiUrl + `api/marketplace-offers`, payload)
      .pipe( map(resp => new MarketplaceOffer(resp)))
  }

  getMarketplaceListingOffer (ID: string): Observable<MarketplaceOffer> {
    return this._http
      .get<MarketplaceOffer>(environment.apiUrl + `api/marketplace-offers/${ID}`)
      .pipe( map(resp => new MarketplaceOffer(resp)))
  }
  updateMarketplaceListingOffer(offerID: number, updates: MarketplaceOfferInterface) {
    return this._http.put<any>(environment.apiUrl + `api/marketplace-offers/${offerID}`, updates).pipe( map(resp => new MarketplaceOffer(resp)));
  }

  getOffers(
    pageIdx: number,
    pageSize: number,
    sort: string | null,
    filters,
    groupBy: string[] | null = null
  ): Observable<any> {
    let params = this.utils.buildParams(pageIdx, pageSize, sort, filters)

    if (groupBy) {
      params = params.set('groupBy', groupBy.join(','))
    }

    return this._http
      .get<QueryResponse>(environment.apiUrl + `api/marketplace-offers`, { params })
      .pipe(
        map(resp => {
          return {
            count: resp.count,
            data: resp.rows.map(row => new MarketplaceOffer(row))
          }
        })
      )
  }





  /**
   *
   * inventory/
   */

  getInventoryByID (inventoryID: number): Observable<InventoryRecord> {
    return this._http
      .get<InventoryRecord>(environment.apiUrl + `api/inventory/${inventoryID}`)
      .pipe(
        map(inventoryRecord =>
          new InventoryRecord(inventoryRecord)
        )
      )
  }

  getInventory (
    pageIdx: number,
    pageSize: number,
    sort: string | null,
    filters
  ) {
    let params = this.utils.buildParams(pageIdx, pageSize, sort, filters)

    return this._http
      .get<QueryResponse>(environment.apiUrl + 'api/inventory', { params })
      .pipe(
        map((_response: QueryResponse) => {
          return {
            data: _response.rows.map(inventoryRecord =>
              new InventoryRecord(inventoryRecord)
            ),
            count: _response.count
          }
        })
      )
  }

  createInventory (body): Observable<InventoryRecord> {
    return this._http.post<any>(environment.apiUrl + `api/inventory`, body).pipe(
      map(inventory => new InventoryRecord(inventory))
    )
  }

  downloadInventory(body): Observable<string> {
    return this._http.post<string>(environment.apiUrl + `api/inventory/download`, body)
  }

  updateInventory (inventoryID, body): Observable<any> {
    return this._http.put<any>(environment.apiUrl + `api/inventory/${inventoryID}`, body).pipe(
      map(inventory => new InventoryRecord(inventory))
    )
  }

  deleteInventoryItems(inventoryID: number, body): Observable<any> {
    return this._http.post<any>(
      environment.apiUrl + `api/inventory/${inventoryID}/unstock`,
      body
    );
  }


  // sale-channels/
  getListingBidSuggestion( saleChannelID: number, productVariantID: number, warehouseID:number =null): Observable<ListingBidSuggestion> {
    const  params =  warehouseID ? new HttpParams().set('warehouseID', warehouseID) :{}
    return this._http.get<ListingBidSuggestion>(environment.apiUrl + `api/sale-channels/${saleChannelID}/variants/${productVariantID}/listing-bid-suggestion`, {params}).pipe(
      map(info => new ListingBidSuggestion(info))
    )
  }

  getActiveInventoryListing(saleChannelID: number, productVariantID: number): Observable<InventoryListing> {
    return this._http.get<InventoryListing>(environment.apiUrl + `api/sale-channels/${saleChannelID}/variants/${productVariantID}/active-listing`).pipe(
      map(inventoryListing => new InventoryListing(inventoryListing))
    )
  }



  getSaleChannelByID(saleChannelID: number): Observable<SaleChannel> {
    return this._http.get<SaleChannel>(environment.apiUrl + `api/sale-channels/${saleChannelID}`).pipe(
      map(sc => new SaleChannel(sc))
    )
  }

  createSaleChannel(body: Object): Observable<SaleChannel> {
    return this._http.post<SaleChannel>(environment.apiUrl + `api/sale-channels`, body).pipe(
      map(sc => new SaleChannel(sc))
    )
  }

  updateSaleChannel(saleChannelID: number, updates): Observable<SaleChannel> {
    return this._http.put<SaleChannel>(environment.apiUrl + `api/sale-channels/${saleChannelID}`, updates).pipe(
      map(sc => new SaleChannel(sc))
    )
  }

  getSaleChannelConsignors(saleChannelID: number, pageIdx: number, pageSize: number, sort: string = null, filters): Observable<any> {
    let params = this.utils.buildParams(pageIdx, pageSize, sort, filters)
    return this._http.get<any>(environment.apiUrl + `api/sale-channels/${saleChannelID}/consignors`, { params: params })
      .pipe(
        map((_response: QueryResponse) => {
          return {
            data: _response.rows.map(account => new Account(account)),
            count: _response.count
          }
        })
      )
  }

  updateSaleChannelConsignor(saleChannelID: number, accountID: number, updates): Observable<Account> {
    return this._http.put<Account>(environment.apiUrl + `api/sale-channels/${saleChannelID}/consignors/${accountID}`, updates)
      .pipe(map(account => new Account(account)))
  }

  createSaleChannelConsignmentFees(saleChannelID: number, fees: TransactionRate[]): Observable<SaleChannel> {
    return this._http.post<SaleChannel>(environment.apiUrl + `api/sale-channels/${saleChannelID}/consignment-fees`, fees)
      .pipe(map(sc => new SaleChannel(sc)))
  }

  updateSaleChannelConsignmentFees(saleChannelID: number, fees: TransactionRate[]): Observable<SaleChannel> {
    return this._http.put<SaleChannel>(environment.apiUrl + `api/sale-channels/${saleChannelID}/consignment-fees`, fees)
      .pipe(map(sc => new SaleChannel(sc)))
  }

  deleteSaleChannelConsignmentFees(saleChannelID: number, feeID: number): Observable<SaleChannel> {
    return this._http.delete<SaleChannel>(environment.apiUrl + `api/sale-channels/${saleChannelID}/consignment-fees/${feeID}`)
  }

  // Update sale channel status used for consignment
  updateSaleChannelConsignmentStatus(accountID: number, consignorAccountID: number, saleChannelID: number, updates): Observable<any>{
    return this._http.put<any>(environment.apiUrl + `api/account/${accountID}/consignor/${consignorAccountID}/sale-channels/${saleChannelID}`, updates)
  }

  /**
   * LACED INTEGRATION
   */

  //TODO: REMOVE DUMMY DATA -> `api/sale-channels/laced/validate-credentials` || `api/sale-channels/laced/check-session`
  validateLacedCredentials(email, password) : Observable<{valid: boolean, message: string }> {
    /**
     * valid:
     *  - account is complete and credentials are valid
     * invalid:
     *  - account is not complete -  message: ex. 'Laced account is not complete'
     *  - credentials are invalid -  message: ex. 'Invalid credentials'
     */
    return this._http.post<any>(environment.apiUrl + `api/sale-channels/laced/validate-credentials`, { email, password });
  }

  getLacedProduct(lacedID: number) {
    return this._http.get<any>(environment.apiUrl + `api/product/laced/${lacedID}`).pipe(
      map(_product => new Product(_product))
    )
  }

  // inventory-listings/
  getInventoryListingByID(inventoryListingID): Observable<InventoryListing> {
    return this._http.get<InventoryListing>(environment.apiUrl + `api/inventory-listings/${inventoryListingID}`).pipe(
      map(inventoryListing => new InventoryListing(inventoryListing))
    )
  }

  getInventoryListings(pageIdx: number, pageSize: number, sort: string = null, filters) {
    let params = this.utils.buildParams(pageIdx, pageSize, sort, filters)
    return this._http.get<QueryResponse>(environment.apiUrl + 'api/inventory-listings', { params: params })
      .pipe(
        map((_response: QueryResponse) => {
          return {
            data: _response.rows.map(inventoryListing => new InventoryListing(inventoryListing)),
            count: _response.count
          }
        })
      )
  }

  createInventoryListings(inventoryID: number, body): Observable<InventoryListing[]> {
    return this._http.post<any>(
      environment.apiUrl + `api/inventory/${inventoryID}/listings`,
      body
    );
  }

  deleteInventoryListing(inventoryListingID: number): Observable<string> {
    return this._http.delete<string>(environment.apiUrl + `api/inventory-listings/${inventoryListingID}`)
  }

  reconnectInventoryListing(inventoryListingID: number, productVariantID: number): Observable<string> {
    return this._http.post<string>(environment.apiUrl + `api/inventory-listings/${inventoryListingID}/reconnect`, {productVariantID: productVariantID})
  }

  updateInventoryListing(inventoryListingID: number, updates: object): Observable<string> {
    return this._http.put<string>(environment.apiUrl + `api/inventory-listings/${inventoryListingID}`, updates)
  }

  downloadInventoryListing(body): Observable<string> {
    return this._http.post<string>(environment.apiUrl + `api/inventory-listings/download`, body)
  }

  // stockx api
  stockxApiImportRequest (unformattedStockxUrl) {
    const body = {
      url: unformattedStockxUrl,
      process: true,
    }

    return this._http.post<any>(environment.stockxApi + `api/worker/queue/tasks`, body)
  }

  createStockXAPITask(stockxId, type) {
    const body = {
      stockxId,
      type,
      process: true
    }
    return this._http.post<any>(environment.stockxApi + `api/worker/queue/tasks`, body)
  }

  /**
   *
   *
   *
   *
   * FUNCTION-WRECK LINE
   * BELOW HERE ENDPOINTS ARE DEPRECATED AND NEED REVISION. ONCE REVISITED MOVE ABOVE THIS LINE
   *
   *
   *
   *
   *
   */



  createTransactionRates (accountID, body): Observable<any> {
    return this._http.post<number>(
      environment.apiUrl + `api/account/${accountID}/transaction-rates`,
      body
    )
  }



}

async function getImageAsBase (image: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(image);
  });
}

function isBase(str) {
  try {
      if (str.trim().match(/[^A-Za-z0-9\+\/\=]/)) {
          return false;
      }
      let padding = str.match(/=/g);
      if (padding) {
          if (padding.length > 2) {
              return false;
          }
          if (str.charAt(str.length - padding.length) !== '=') {
              return false;
          }
      }
      let decoded = atob(str);
      return true;
  } catch (e) {
      return false;
  }
}
