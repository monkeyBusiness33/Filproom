import { Component, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from 'src/app/core/api.service';
import { UserService } from 'src/app/core/user.service';
import { OrderLineItem } from 'src/app/shared/models/Order.model';
import { TableWrapperComponent, TableConfiguration, DataRequest } from 'src/app/shared/table-wrapper/table-wrapper.component';

@Component({
  selector: 'app-items-flow',
  templateUrl: './items-flow.component.html',
  styleUrls: ['./items-flow.component.scss'],
})
export class ItemsFlowComponent implements OnInit {
  /**
   * Right now this page is the items-flow later it will be a dashboard for reports generation
   */

  @ViewChild('tableWrapper') tableWrapper: TableWrapperComponent;

  public tableConfigs: TableConfiguration = new TableConfiguration({
    columnsConfig: [
      {reference: 'product.imageReference', displayedName: 'Image',                     dataType: 'string', disableFilter: true},
      {reference: 'createdAt',              displayedName: 'Created At',                dataType: 'date'},
      {reference: 'ID',                     displayedName: 'ID',                        dataType: 'string'},
      {reference: 'product.code',           displayedName: 'Code',              dataType: 'string'},
      {reference: 'product.title',          displayedName: 'Title',            dataType: 'string'}, //NEW
      {reference: 'product.category.name',  displayedName: 'Category',      dataType: 'string'},//NEW
      {reference: 'variant.name',           displayedName: 'Variant Name',              dataType: 'string'},
      {reference: 'cost',                   displayedName: 'Cost',                      dataType: 'number'},
      {reference: 'price',                  displayedName: 'Price',                     dataType: 'number'},
      {reference: 'notes',                  displayedName: 'Notes',                     dataType: 'string'},
      {reference: 'item.warehouse.name',    displayedName: 'Location',                  dataType: 'string'},
      {reference: 'item.account.ID',        displayedName: 'Owner ID',                  dataType: 'string'},
      {reference: 'item.account.name',      displayedName: 'Owner',                     dataType: 'string'},
      {reference: 'item.inventoryID',       displayedName: 'Inv ID',                 dataType: 'string'}, //new
      {reference: 'item.inventory.cost',    displayedName: 'Inv Cost',                 dataType: 'number'}, //new
      {reference: 'item.inventory.price',   displayedName: 'Inv Price',                 dataType: 'number'}, // new
      {reference: 'item.ID',                displayedName: 'Item ID',                   dataType: 'string'},
      {reference: 'item.barcode',           displayedName: 'Barcode',                   dataType: 'string'},
      {reference: 'status.name',            displayedName: 'Fulfillment Status',        dataType: 'string'},
      {reference: 'fulfillment.ID',         displayedName: 'Fulfillment ID',            dataType: 'string'},
      {reference: 'dispatchedAt',           displayedName: 'Dispatched At',             dataType: 'date'},
      {reference: 'order.ID',               displayedName: 'Order ID',                  dataType: 'string'},
      {reference: 'order.type.name',        displayedName: 'Type',                      dataType: 'string'},
      {reference: 'order.reference1',       displayedName: 'Order Reference',           dataType: 'string'},
      {reference: 'order.consignor.fullName',   displayedName: 'Origin',                    dataType: 'string'},
      {reference: 'order.consignee.fullName',   displayedName: 'Destination',               dataType: 'string'},
      {reference: 'order.consignee.email',   displayedName: 'Customer Email',               dataType: 'string'},
      {reference: 'deliveredAt',            displayedName: 'delivered At',              dataType: 'date'},
      {reference: 'order.tags',             displayedName: 'Tags',                      dataType: 'string'},
      {reference: 'order.saleChannel.title', displayedName: 'Sale Channel',              dataType: 'string' } // new
    ],
    tableKey: 'items-flow',
    showColumnsSelection: true,
    showAdvancedFilter: true,
    rowHoverable: false,
    emptyTablePlaceholder: 'No Order Line Items Available',
    dataSourceFnName: 'getOrderLineItems' // pass this to allow table download
  })

  public dataRequested;
  public isLoading: boolean =  true;

  constructor(
    private _api: ApiService,
    public user: UserService,
    private _router: Router,
  ) { }

  ngOnInit() {}

  onDataRequest(evt: DataRequest): void {
    evt.params['accountID'] = this.user.account.ID
    this._api.getOrderLineItems(evt.pageIdx, evt.pageSize, evt.sort, evt.params).subscribe((resp) => {
      this.dataRequested = resp;
    });
  }

  onRowClick(oli: OrderLineItem) {
    this._router.navigate(['/orders/' + oli.orderID])
  }
}
