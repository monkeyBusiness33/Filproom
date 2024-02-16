import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from 'src/app/core/api.service';
import { PluginsService } from 'src/app/core/plugins.service';
import { UserService } from 'src/app/core/user.service';
import { ModalService } from 'src/app/shared/modal/modal.service';
import { Order, OrderLineItem } from 'src/app/shared/models/Order.model';
import { TableWrapperComponent, TableConfiguration, DataRequest } from 'src/app/shared/table-wrapper/table-wrapper.component';

@Component({
  selector: 'app-invoices',
  templateUrl: './invoices.component.html',
  styleUrls: ['./invoices.component.scss'],
})
export class InvoicesComponent implements OnInit {
  @ViewChild('tableWrapper') tableWrapper: TableWrapperComponent;

  public tableConfigs: TableConfiguration = new TableConfiguration({
    columnsConfig: [
      {reference: 'ID',                     displayedName: 'ID',                        dataType: 'string'},
      {reference: 'createdAt',              displayedName: 'Created At',                 dataType: 'date'},
      {reference: 'reference1',              displayedName: 'Reference',                 dataType: 'string'},
      {reference: 'saleChannel.title',           displayedName: 'Sale Channel',              dataType: 'string'},
      {reference: 'consignor.fullName',           displayedName: 'Origin',              dataType: 'string'},
      {reference: 'consignee.fullName',           displayedName: 'Destination',              dataType: 'string'},
      {reference: 'status.name',           displayedName: 'Status',              dataType: 'string'},
      {reference: 'action',                 displayedName: 'Action',                    dataType: 'string', disableFilter: true},
    ],
    tableKey: 'documents',
    rowSelectable: true,
    showColumnsSelection: true,
    showAdvancedFilter: true,
    rowHoverable: false,
    emptyTablePlaceholder: 'No Orders Available',
    dataSourceFnName: 'getOrders', // pass this to allow table download
    disableDownload: true
  })

  public dataRequested;
  public isLoading: boolean =  true;

  public documentsType: string = 'invoices'; // purchase-orders or invoices
  
  constructor(
    private _api: ApiService,
    public user: UserService,
    private _router: Router,
    private _modal: ModalService,
    private _plugins: PluginsService,
    private _route: ActivatedRoute
  ) { }

  ngOnInit() {
    this.documentsType = this._route.snapshot.url[0].path
  }

  onRefresh() {
    this.tableWrapper?.refresh()
  }

  onDataRequest(evt: DataRequest): void {
    evt.params['accountID'] = this.user.account.ID
    evt.params['typeID'] = this.documentsType === 'invoices' ? 4 : 3
    this._api.getOrders(evt.pageIdx, evt.pageSize, evt.sort, evt.params).subscribe((resp) => {
      this.dataRequested = resp;
    });
  }

  onRowClick(order: Order) {
    // prevent selection if invoice not has been generated for the order
    if (!order.invoiceFilename) {
      const _c = [...this.tableWrapper.selector.selected.filter(o => o.ID != order.ID)] // create new copy in memory of selected objects
      this.tableWrapper.selector.clear() // clear and re-populate
      _c.forEach(record => this.tableWrapper.selector.select(record))
      this._modal.warning(`Document not generated for this order. Generate document first.`)
      return
    }
  }

  onGenerateInvoice(evt, order: Order) {
    evt.stopPropagation();

    this._api.downloadInvoice(order.ID)
    .subscribe((downloadInvoiceResponse: Object) => {
      this.onRefresh()
      this._plugins.printPDF(
        downloadInvoiceResponse['invoiceBase64'], 
        `invoice_order_${order.ID}.pdf`
      )   
    })
  }

  onViewOrder(evt, order: Order) {
    evt.stopPropagation();

    this._router.navigate([`/orders/${order.ID}`])
  }

  onBatchDownloadDocuments() {
    if (this.tableWrapper?.selector.selected.length === 0) return

    this._api.submitTask('downloadBulkDocuments', {
      email: this.user.email,
      orderIDs: this.tableWrapper?.selector.selected.map(order => order.ID)
    }).subscribe((resp) => {
      this.tableWrapper.selector.clear()
      this._modal.success(`Task created - you will receive an email when your download is ready.`)
    })
  }
}
