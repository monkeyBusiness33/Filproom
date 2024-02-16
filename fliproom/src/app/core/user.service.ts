import { HttpClient } from '@angular/common/http';
import { Injectable, Injector } from '@angular/core';
import { environment } from 'src/environments/environment';
import { Address } from '../shared/models/Address.model';
import { SaleChannel } from '../shared/models/SaleChannel';
import { Warehouse } from '../shared/models/Warehouse.model';
import { IAMService, Role } from './iam.service';
import { AnalyticsService } from './analytics.service';

export class Account {
  ID: number;
  name: string;
  currency: string;
  taxRate: number
  vatNumber: string
  isConsignor: boolean;
  billingAddress: Address
  saleChannels: SaleChannel[]
  role: Role;
  logo: string;
  warehouses: Warehouse[];

  shopifyStoreName: string
  shopifyAPIUrl: string

  stripeAccountID: string;
  stripeAPIKey: string;
  defaultStripeDestinationID: string;
  tier: string;
  _sizeChartsString: string

  constructor(input: any) {
    if (input == null) return

    input.billingAddress =  input.billingAddress ? new Address(input.billingAddress) : null
    input.warehouses = (input.warehouses || []).map(wh => new Warehouse(wh))
    input.saleChannels = (input.saleChannels || []).map(sc => new SaleChannel(sc))
    input._sizeChartsString = input.sizeChartConfigs
    return Object.assign(this, input);
  }

  get currencySymbol(): string {
    const currencySymbols = {
      USD: '$',
      GBP: '£',
      EUR: '€',
    };

    return currencySymbols[this.currency];
  }

  get invoicingEnabled(): boolean {
    return this.taxRate != null && this.billingAddress.ID != null && this.vatNumber != null
  }

  get logoUrl(): string {
    return this.logo ? `${environment.storageUrl}resources/${this.logo}` : null;
  }

  get sizeChartConfig(): string[] {
    return  this._sizeChartsString.split(",").filter(chart => chart != "")
  }

  get externalSaleChannelAccountIDs():number[]{
    const externalAccountIDs = new Set<number>()
    this.saleChannels.map(_sc => {
      _sc.accountID != this.ID ? externalAccountIDs.add(_sc.accountID ) : null
    })
    return Array.from(externalAccountIDs)
  }

  get externalSaleChannels():number[]{
    const saleChannels = []
    this.saleChannels.map(_sc => {
      _sc.accountID != this.ID ? saleChannels.push(_sc ) : null
    })
    return saleChannels
  }

  get internalSaleChannels():number[]{
    const saleChannels = []
    this.saleChannels.map(_sc => {
      _sc.accountID == this.ID ? saleChannels.push(_sc ) : null
    })
    return saleChannels
  }
}

@Injectable({
  providedIn: 'root',
})
export class UserService {

  public ID: number;
  public createdAt: Date;
  public name: string;
  public surname: string;
  public email: string;
  public password: string;
  public _phoneNumber: string;
  public phoneCountryCode: string;
  public account: Account; // root account for the user
  public organization: Account;
  public role: Role;
  public iam = this._iam;
  public deviceID: string;
  private _experiments: string[] = [] // name of the experiments the user is part of
  public apiKey: string

  constructor(
    private _iam: IAMService,
    private _injector: Injector,
    private _http: HttpClient,
  ) {}

  deserialize(input) {
    this.ID = input.ID;
    this.name = input.name;
    this.createdAt = input.createdAt;
    this.surname = input.surname;
    this._phoneNumber = input.phoneNumber
    this.phoneCountryCode = input.phoneCountryCode
    this.email = input.email;
    this.password = input.password;
    this.account = new Account(input.account);
    this.organization = input.organization;
    this.role = input.roles.find(role => role.accountID == this.account.ID)
    this.deviceID = input.deviceID;
    this.apiKey = input.apiKey
    this._experiments = input.experiments || []

    this.iam.initialize(this.role);
    // set user id for analytics once logged in
    const analytics = this._injector.get<AnalyticsService>(AnalyticsService);
    analytics.setUserId(this.ID)


    // on user opening the app (resume or signin), check if we have to update the device ID for notifications
    if (localStorage.getItem('deviceID') && this.deviceID != localStorage.getItem('deviceID')) {
      this._http.put<any>(environment.apiUrl + `api/user/${this.ID}`, {deviceID: localStorage.getItem('deviceID')}).subscribe(() => {})
    }
    return this
  }

  getStorageUrl(filename: string): string {
    return `${environment.storageUrl}resources/${filename}`;
  }

  isBetaUser(experimentName: string) {
    return this._experiments.includes(experimentName)
  }

  get fullName(): string {
    return `${this.name} ${this.surname}`;
  }

  get phoneNumber(): string {
    return this.phoneCountryCode && this._phoneNumber ? `(${this.phoneCountryCode}) ${this._phoneNumber}` : ''
  }

  get daysSinceSignup(): number {
    return Math.floor((new Date().getTime() - new Date(this.createdAt).getTime()) / (1000 * 3600 * 24))
  }


  get isInternalPersonalShopper(): boolean {
    return this.role.type == 'personal-shopper' && this.account.saleChannels[0].accountID == this.account.ID
  }

  get isExternalPersonalShopper(): boolean {
    return this.role.type == 'personal-shopper' && this.account.saleChannels[0].accountID != this.account.ID
  }

  get isPersonalShopper(): boolean {
    return this.role.type == 'personal-shopper'
  }
}

