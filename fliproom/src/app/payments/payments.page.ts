import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { map, mergeMap } from 'rxjs/operators';
import { forkJoin } from 'rxjs';
import { ApiService } from 'src/app/core/api.service';
import { UserService } from 'src/app/core/user.service';
import { Transaction } from 'src/app/shared/models/Transaction.model';
import { ModalService } from 'src/app/shared/modal/modal.service';
import { DataRequest, TableConfiguration, TableWrapperComponent } from 'src/app/shared/table-wrapper/table-wrapper.component';
import { FliproomListComponent } from '../shared/fliproom-list/fliproom-list.component';
import { environment } from 'src/environments/environment';
import { PayoutFormComponent } from './modals/payout-form/payout-form.component';
import { AnalyticsService } from '../core/analytics.service';

@Component({
  selector: 'app-payments',
  templateUrl: './payments.page.html',
  styleUrls: ['./payments.page.scss'],
})
export class PaymentsPage implements OnInit {
  @ViewChild('tableWrapper') tableWrapper: TableWrapperComponent;
  @ViewChild('fliproomList') fliproomList: FliproomListComponent;

  public statusesTabsList: string[] = [
    'money in', 'money out'
  ]
  public currentSelectedSegment: string = 'money in'
  public environment = environment

  public tableConfigs: TableConfiguration = new TableConfiguration({
    columnsConfig: [
    ],
    tableKey: 'payments',
    showColumnsSelection: true,
    showAdvancedFilter: true,
    rowHoverable: true,
    emptyTablePlaceholder: '',
    dataSourceFnName: 'getTransactionsList' // pass this to allow table download
  });

  public dataRequested;


  constructor(
    public user: UserService,
    private _modalCtrl: ModalService,
    public _api: ApiService,
    private _router: Router,
    private _route: ActivatedRoute,
    private _analytics: AnalyticsService
  ) {
    this._route.queryParams.subscribe(p => {
      // if missing payment status to display - redirect to status all
      if (!p.flow) {
        this._router.navigate(['/payments'], {queryParams: {flow: 'money in'}})
        return
      }
      this.currentSelectedSegment = p.flow


      this.tableConfigs.columnsConfig = [
        {reference: 'ID',                             displayedName: 'ID',                   dataType: 'string'},
        {reference: 'createdAt',                      displayedName: 'Created At',           dataType: 'date'},
        {reference: 'type',                           displayedName: 'Type',           dataType: 'string'},
      ]

      if (this.currentSelectedSegment == 'money in'){
        this.tableConfigs.columnsConfig.push({reference: 'fromAccount.name',   displayedName: 'From Account',    dataType: 'string'})
      } else {
        this.tableConfigs.columnsConfig.push({reference: 'toAccount.name',   displayedName: 'To Account',    dataType: 'string'})
        this.tableConfigs.columnsConfig.push({reference: 'toAccount.stripeAccountID',  displayedName: 'Stripe Account ID',            dataType: 'string'})
      }

      this.tableConfigs.columnsConfig.push({reference: 'reference', displayedName: 'Tx Reference',   dataType: 'string'})
      this.tableConfigs.columnsConfig.push({reference: 'order.type.name', displayedName: 'Order Type',   dataType: 'string'})


      if (this.currentSelectedSegment == 'money out'){
        this.tableConfigs.columnsConfig.push({reference: 'orderLineItem.status.name',  displayedName: 'Order Item Status',            dataType: 'string'})
      }
      this.tableConfigs.columnsConfig.push({reference: 'stripeID',  displayedName: 'Stripe Tx ID',            dataType: 'string'})
      this.tableConfigs.columnsConfig.push({reference: 'gateway',  displayedName: 'Gateway',            dataType: 'string'})
      this.tableConfigs.columnsConfig.push({reference: 'order.saleChannel.title', displayedName: 'Sale Channel',   dataType: 'string'})
      this.tableConfigs.columnsConfig.push({reference: 'grossAmount',   displayedName: 'Amount',    dataType: 'number'})
      this.tableConfigs.columnsConfig.push({reference: 'status',   displayedName: 'Tx Status',    dataType: 'string'})
      this.tableConfigs.columnsConfig.push({reference: 'completedAt', displayedName: 'Completed At',   dataType: 'date'})

      this.tableConfigs.emptyTablePlaceholder = this.currentSelectedSegment == 'money in' ? 'No sale record available. Start by recording a sale' : 'No expense record available'
      this.tableWrapper ? this.tableWrapper.ngOnInit() : null
      this.onRefresh()
    })
  }

  ngOnInit(): void {
  }

  onRefresh() {
    this.tableWrapper ? this.tableWrapper.refresh() : null
    this.fliproomList ? this.fliproomList.refresh() : null
  }

  onSegmentChanged(evt){
    this.currentSelectedSegment = evt.detail.value
    this._router.navigate(['/payments'], {queryParams: {flow: this.currentSelectedSegment}})
    this.onRefresh()
  }

  //fetch data and apply filters
  onDataRequest(evt: DataRequest): void {
    //if tab selected with a particular status
    if (this.currentSelectedSegment == 'money in'){
      evt.params['toAccountID'] = this.user.account.ID
    } else {
      evt.params['fromAccountID'] = this.user.account.ID
    }

    this._api.getTransactionsList(evt.pageIdx, evt.pageSize, 'id:desc', evt.params).subscribe((resp) => {
       this.dataRequested = resp;
    });

  }

  //Open payment model
  onRowClick(tx: Transaction) {
    this._analytics.trackEvent('payment_view', {type: tx.type})
    this._modalCtrl.open(PayoutFormComponent, {txId: tx.ID}, {cssClass: 'full-screen-y'}).subscribe(() => this.onRefresh())
  }

  getTagColor(statusName): string {
    switch(statusName) {
      case 'unpaid':
        return 'warning'
      case 'unpaid':
        return 'warning'
      case 'voided':
        return 'error'
      case 'settled':
        return 'success'
      default:
        return 'primary'
    }
  }
}
