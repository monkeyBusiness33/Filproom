import {Component, OnInit, ViewChild} from '@angular/core';
import {ScannerResponse} from "../../../core/barcode-scanner.service";
import {PluginsService} from "../../../core/plugins.service";
import {UserService} from "../../../core/user.service";
import {IModalResponse, ModalService} from "../../../shared/modal/modal.service";
import {ApiService} from "../../../core/api.service";
import {ActivatedRoute, Router} from "@angular/router";
import {filter, mergeMap, switchMap} from "rxjs/operators";
import {forkJoin, of, Subscription} from "rxjs";
import {DataRequest} from "../../../shared/table-wrapper/table-wrapper.component";
import {FliproomListComponent} from "../../../shared/fliproom-list/fliproom-list.component";
import {Item} from "../../../shared/models/Item.model";
import {JobLineItem} from "../../../shared/models/Job.model";
import {ActionSheetController} from "@ionic/angular";
import {OrderLineItem} from "../../../shared/models/Order.model";
import {map} from "rxjs/operators";

@Component({
  selector: 'app-job-line-items',
  templateUrl: './job-line-items.page.html',
  styleUrls: ['./job-line-items.page.scss'],
})
export class JobLineItemsPage implements OnInit {

  private _activeSubs: Subscription[] = []

  public jobID // current selected job
  public job // current selected job

  public checkType: string // can either be confirm or anomaly
  public selectedTab: string  = 'todo'//TO-DO or confirmed - same for anomaly and confirmation checks

  // FLIPROOM LIST CONFIG
  @ViewChild('fliproomList') fliproomList: FliproomListComponent
  public dataRequested
  public emptyListPlaceholder: string = 'No Items Available'

  constructor(
    public user: UserService,
    private _modalCtrl: ModalService,
    private _plugins: PluginsService,
    private _api: ApiService,
    private _router: Router,
    private _user: UserService,
    private _route: ActivatedRoute,
    public actionSheetController: ActionSheetController
  ) {

  }


  ngOnInit() {
    this.checkType = this._route.snapshot.queryParams.checkType
    this.jobID = this._route.snapshot.queryParams.jobID

    //fetch job
    this._api.getJob(this.jobID).subscribe(res=> {
        this.job = res
    })
  }

  ionViewWillEnter() {
    /**
     * ON BARCODE SCANNED:
     *
     *  - handle item which has been sold
     *  - handle item matched but at a different location with no pending transfers -> add jobLineItem logic for transfer
     *  - handle item that currently is allocated to a transfer that has not been completed
     *  - handle moving confirmation process
     *  - handle wrong check type selected
     *  - handle item with missing barcode -> will be left in the TO-DO feed so when tapped show option to assign barcode
     *
     *
     *  CONFIRM CASES {action}:
     *
     *  [1.] Move over to completed list
     *
     *  ANOMALY CASES {action}:
     *
     *  [1.] Single item scanned, MULTIPLE results {NO-RECORD}-> (Message) Find item and re-assign barcode
     *  [2.] NO ITEMS found for barcode scanned {NO-RECORD}-> (Message-Confirm) No item found for this barcode - make sure right barcode was scanned else re-add item to inventory
     *  [3.] Item has NO LOCATION and DELETED {'add-to-inventory'}-> (Message-confirm) (MANUAL-RESOLVE) Create jobLineItem record as anomaly
     *  [4.] Item has NO LOCATION and SOLD {'complete-sale'}-> (Message-confirm) (MANUAL-RESOLVE) Create jobLineItem record as anomaly
     *  [5.] Item has NO LOCATION and TRANSFERRED {'complete-transfer'}-> (Message-confirm) (MANUAL-RESOLVE) Create jobLineItem record as anomaly
     *  [6.] Item has incorrect LOCATION {'change-location'}-> (ACTION) (Message-confirm)  Allow Location change -> resolve anomaly
     *  [7.] Item has correct LOCATION and SOLD {'complete-sale'}-> (ACTION) (MANUAL-RESOLVE) Pleases re-add item for correct account
     *  [8.] Item has correct LOCATION and TRANSFERRED {'complete-transfer'}-> (ACTION) (MANUAL-RESOLVE) Pleases re-add item for correct account
     *  [9.] Found NO BARCODE on item  {'assign-barcode'} -> (JOB-ACTION) (MANUAL-RESOLVE) Add barcode to item
     *  [10.] Feed Job-line-item NOT FOUND  {'find-item'} -> (JOB-ACTION) Delete item once added to anomalies
     *  [11.] Item DELETED since stock take started {'add-to-inventory'}->  (Message-confirm) (MANUAL-RESOLVE) Create jobLineItem record as anomaly
     *  [12] UNKNOWN ANOMALY {'inspect-case'} -> (ACTION) (MANUAL-RESOLVE) Pleases inspect case further
     *
     * EXTRA CASES:
     *
     *  [1.] Item has already been checked -> (Message) Item already checked
     *  [2.] Anomaly already assigned to item but scanning on confirm checks-> (Message-confirm) Set item aside and resolve with anomalies
     *  [3.] Scanning a resolved anomaly
     */

    const sub1 = this._plugins.scanner.scannerReadListener.subscribe((scannerResponse: ScannerResponse) => {
      if (scannerResponse.status == "error") {
        this._modalCtrl.error(scannerResponse.message)
        return
      }

      // Generate search params based on barcode received
      const barcode = scannerResponse.data
      const params = {
        'barcode': barcode
      }

      //search items in DB matching barcode scanned
      this._api.getItemsList(0, 99, 'deletedAt:asc', params).subscribe(res => {
        // HANDLING ITEM CASE LOGIC
        const items = res.data
        //PRIORITY CASES

        // [ANOMALY] [1.] Single item scanned, MULTIPLE results
        if (items.length > 1){
          this._modalCtrl.confirm('Barcode has been assigned to multiple items. Find item and re-assign barcode')
        }
        //[ANOMALY] [2.] NO ITEMS found for barcode scanned
        else if ( items.length == 0){
          this._modalCtrl.confirm('No barcode found, make sure right barcode was scanned or else this item was not inbounded correctly')
        }

        else if(items.length == 1){

          const item = res.data[0] as Item
          console.log(res.data[0])
          console.log(!item.inventoryID && item.deletedAt)

          const jobLineItem = item.jobLineItems.find(jli => jli.jobID == this.jobID)
          //ITEM HAS CORRECT LOCATION
          if(jobLineItem){
            //[EXTRA] [2.] Anomaly already assigned to item but scanning on confirm checks
            if (jobLineItem.action && !jobLineItem.actionResolvedAt){
              this._modalCtrl.confirm(`This item has an unresolved anomaly with action: ${jobLineItem.action}. Please set aside!`)
            }
            //[EXTRA] [3.] Scanning a resolved anomaly
            else if (jobLineItem.action && jobLineItem.actionResolvedAt){
              this._modalCtrl.confirm(`This item has an resolved anomaly with action: ${jobLineItem.action}. Proceed with checks`)
            }
            //[EXTRA]  [1.] Item has already been checked
            else if ( !jobLineItem.action && jobLineItem.confirmedAt){
              this._modalCtrl.confirm(`This item has already been checked and confirmed, updating confirmedAt timestamp`)
              this.confirmJobLineItem(jobLineItem.ID)
            }

            //[ANOMALY][11.] Item DELETED since stock take started
            else if( !item.inventoryID && item.deletedAt){
              this.moveJobLineItemToAnomaly(jobLineItem, 'add-to-inventory', 'This item has been removed from the platform, creating an anomaly to re-add it to the stock')
            }
            //[ANOMALY][7.] Item has correct LOCATION and SOLD
            else if( !item.inventoryID && !item.deletedAt){
              this.moveJobLineItemToAnomaly(jobLineItem, 'complete-sale', 'This item has been sold , creating anomaly. Please complete sale')
            }
            //[ANOMALY][8.] Item has correct LOCATION and TRANSFERRED
            //TODO: DEPRECATION WARNING
            else if( item.inventoryID && !item.inventory.warehouseID ){
              this.moveJobLineItemToAnomaly(jobLineItem, 'complete-transfer', 'This item is allocated to a transfer, creating anomaly. Please complete transfer')
            }
            //[CONFIRM][1.] Move over to completed list
            else if( !jobLineItem.confirmedAt){
              this.confirmJobLineItem(jobLineItem.ID)
            }
            //[ANOMALY][12] UNKNOWN ANOMALY
            else {
              this.moveJobLineItemToAnomaly(jobLineItem, 'inspect-case', 'This is an unknown anomaly, please set aside and inspect further')
            }

          }
          // ITEM HAS DIFFERENT OR NO LOCATION
          else {
            //NO LOCATION
            if(!item.warehouseID){
              //[ANOMALY][3.] Item has NO LOCATION and DELETED
              if( !item.inventoryID && item.deletedAt){
                this.createJobLineItemAnomaly(item, 'add-to-inventory', 'This item has been removed from the platform, creating an anomaly to re-add it to the stock')
              }
              //[ANOMALY][4.] Item has NO LOCATION and SOLD
              else if(!item.inventoryID){
                this.createJobLineItemAnomaly(item, 'inspect-sale', 'This item has been sold and marked as shipped, creating anomaly. Please inspect sale')
              }
              //[ANOMALY][5.] Item has NO LOCATION and TRANSFERRED
              else if(item.inventoryID){
                this.createJobLineItemAnomaly(item, 'complete-transfer', 'This item is in transit for a transfer. Creating anomaly, please complete transfer.')
              }
              //[ANOMALY][12] UNKNOWN ANOMALY
              else {
                this.createJobLineItemAnomaly(item, 'inspect-case', 'This is an unknown anomaly, please set aside and inspect further')
              }

            }
            // DIFFERENT LOCATION
            else {
              if(item.inventoryID ){
                //[ANOMALY][6.] Item has incorrect LOCATION {'change-location'}
                this.createJobLineItemAnomaly(item, 'change-location', 'Creating anomaly. This item has a different location on the system')
              }
              //[ANOMALY][12] UNKNOWN ANOMALY
              else {
                this.createJobLineItemAnomaly(item, 'inspect-case', 'This is an unknown anomaly, please set aside and inspect further')
              }
            }
          }
        }

      })
    })

    this._activeSubs.push(sub1)
  }

  ionViewWillLeave() {
    this._activeSubs.map(sub => sub.unsubscribe())
  }



  // FETCHING DATA
  onDataRequest (evt: DataRequest): void {
    // PARAM BUILDING BASED ON SELECTED CHECK TYPE AND TAB
    evt.params['jobID']= this.jobID
    //CONFIRM checks
    if(this.checkType == 'confirm'){
      evt.params['action']= '!*'
      evt.params['status.name'] = this.selectedTab == 'todo' ? 'pending': 'confirmed'
    }
    //ANOMALY checks
    else{
      evt.params['action']= '*'
      evt.params['status.name'] = this.selectedTab == 'todo' ? 'pending': ['confirmed', 'deleted']
    }
    this._api.getJobLineItems(evt.pageIdx, evt.pageSize, evt.sort, evt.params).subscribe(resp => this.dataRequested = resp)
  }

  //LIST REFRESH
  onRefresh() {
    this.fliproomList ? this.fliproomList.refresh() : null
  }

  onTabChanged(evt: any){
    this.selectedTab = evt.detail.value
    this.onRefresh()
  }

  onBarcodeStart() {
    this._plugins.scanner.setReadMode();
  }


  /**
   * Job Line Item Actions
   */

  //GENERATE JLI ACTIONS
  /**
   * EXTRA:
   *  [1.] Check JLI Validity from parallelization
   *
   * GENERAL ACTIONS:
   *
   *  [1.] Item details
   *  [2.] Edit JLI notes
   *  [3.] CLose Options
   *
   * CONFIRMATION CHECKS:
   *
   *  [1.] Mark as confirmed  - confirms JLI and allocates it to DONE list
   *  [2.] Item not found  - creates item missing anomaly ['find-item']
   *  [3.] No Barcode on Item -  creates no barcode on item anomaly ['assign-barcode']
   *  [4.]Create inspection anomaly -  creates inspection anomaly ['inspect-case']
   *
   * ANOMALY CHECKS:
   *
   *  [1.] Mark as resolved - anomaly gets manually marked as resolved
   *  [2.] Delete item ['find-item'] - delete item and resolve anomaly
   *  [3.] Change location ['change-location'] - change items location through autocompleted transfer and resolve anomaly
   */

  async openJobLineItemOptions(jobLineItem) {
    //fetch item for job parallelization purposes
    this._api.getJobLineItem(jobLineItem.ID).subscribe(async (updatedJobLineItem: JobLineItem)=> {
      //[EXTRA][1.] Check JLI Validity from parallelization
      if (jobLineItem.updatedAt != updatedJobLineItem.updatedAt){
        this._modalCtrl.info('This item has been updated, please refresh and try again')
      }
      else {
        jobLineItem = updatedJobLineItem
        let actionSheetButtons = []
        //CONFIRMATION CHECK JLI OPTIONS
        if (this.checkType == 'confirm' && this.selectedTab == 'todo'){
          // [CONFIRM][2.] Item not found  - creates item missing anomaly ['find-item']
          actionSheetButtons.push({title: 'Item Not Found', key: 'item-not-found'})
          // [CONFIRM][3.] No Barcode on Item -  creates no barcode on item anomaly ['assign-barcode']
          if (!jobLineItem.item.barcode) {
            actionSheetButtons.push({title: "No Barcode", key: 'no-barcode'})
          }
          // [CONFIRM][4.]Create inspection anomaly -  creates inspection anomaly ['inspect-case']
          actionSheetButtons.push({title: "Create inspection anomaly", key: 'create-inspection-anomaly'})
          // [CONFIRM] [1.] Mark as confirmed  - confirms JLI and allocates it to DONE list
          actionSheetButtons.push({title: "Mark as confirmed", key: 'mark-confirmed'})
        }
        //ANOMALY CHECK JLI OPTIONS
        else if(this.checkType == 'anomaly'  && this.selectedTab == 'todo'){
          // [ANOMALY][2.] Delete item ['find-item'] - delete item and resolve anomaly
          if (jobLineItem.action == 'find-item' && jobLineItem.item.inventoryID && !jobLineItem.item.deletedAt ){
            actionSheetButtons.push({title: "Delete Item", key: 'delete-item'})
          }
          if(jobLineItem.action == 'change-location' && jobLineItem.item.inventoryID && !jobLineItem.item.deletedAt  ){
            //[ANOMALY][3.] Change location ['change-location'] - change items location through autocompleted transfer and resolve anomaly
            actionSheetButtons.push({title: "Change item location", key: 'change-item-location'})
          }
          //[ANOMALY][1.] Mark as resolved - anomaly gets manually marked as resolved
          actionSheetButtons.push({title: "Mark As Resolved", key: 'resolve-anomaly'})

        }
        //GENERAL JLI OPTIONS
        actionSheetButtons.push({title: "Edit Job Item Notes", key: 'edit-notes'})
        actionSheetButtons.push({title: "Item Info", key: 'item-info'})
        this._modalCtrl.actionSheet('Actions', actionSheetButtons).pipe(
          filter((resp: IModalResponse) => resp.role == "submit"),
          map((resp: IModalResponse) => resp.data),
        ).subscribe((action: string) => {
          switch(action) {
            case 'item-not-found':
              this.moveJobLineItemToAnomaly(jobLineItem,'find-item', "Creating anomaly so that item can be found, if not found delete item from anomaly check options" )
              break;
            case 'no-barcode':
              this.moveJobLineItemToAnomaly(jobLineItem, 'assign-barcode', "This item has no barcode creating anomaly so you can assign one")
              break;
            case 'create-inspection-anomaly':
              this.moveJobLineItemToAnomaly(jobLineItem, 'inspect-case', "Creating inspection anomaly")
              break;
            case 'mark-confirmed':
              this._modalCtrl.confirm('Are you sure this item has no anomalies').pipe(filter(res => res)).subscribe(res => {
                this.confirmJobLineItem(jobLineItem.ID)
              })
              break;

            case 'delete-item':
              this._modalCtrl.confirm(`Delete Item with Barcode ${jobLineItem.item.barcode} from the system? This action can't be undone`).pipe(
                filter(res => res)
              ).subscribe(resp => {
                this.deleteAnomalyJobLineItem(jobLineItem)
              })
              break;

            case 'change-item-location':
              this.changeItemLocation(jobLineItem)
              break;

            case 'resolve-anomaly':
              this.resolveAnomaly(jobLineItem.ID)
              break;

            case 'edit-notes':
              this.onUpdateJobLineItemNotes(jobLineItem)
              break;

            case 'item-info':
              this._router.navigate([`/items/${jobLineItem.item.ID}`])
              break;

            case 'create-inspection-anomaly':
              this.moveJobLineItemToAnomaly(jobLineItem, 'inspect-case', "Creating inspection anomaly")
              break;

          }

        })
      }

      // this._modalCtrl.actionSheet('Actions', actions).pipe(
      //   filter((resp: IModalResponse) => resp.role == "submit"),
      //   map((resp: IModalResponse) => resp.data),
      // ).subscribe((action: string) => {
      //   switch(action) {
      //     case 'notes':
      //       this.onEditItemsNotes(orderLineItem)
      //       break;
      //     case 'details':
      //       this._router.navigate([`/items/${orderLineItem.item.ID}`])
      //       break;
      //   }
      // })
    })
  }

  confirmJobLineItem(jobLineItemID){
    this._api.updateJobLineItem(jobLineItemID, {confirmedAt: new Date(), completedAt: new Date(), status: 'confirmed'}).subscribe((res) => {
      this._modalCtrl.success('Item confirmed successfully')
      //TODO play sound
      this.onRefresh()
    })
  }

  resolveAnomaly(jobLineItemID){
    this._api.updateJobLineItem(jobLineItemID, {completedAt: new Date(), status: 'confirmed', actionResolvedAt:new Date()}).subscribe((res) => {
      this._modalCtrl.success('Anomaly Marked as Resolved')
      //TODO play sound
      this.onRefresh()
    })
  }

  deleteAnomalyJobLineItem(jobLineItem) {
    this._api.deleteInventoryItems(jobLineItem.item.inventoryID, {itemID: jobLineItem.item.ID}).pipe(
      switchMap(res => this._api.updateJobLineItem(jobLineItem.ID, {
        deletedAt: new Date(),
        completedAt: new Date(),
        actionResolvedAt:new Date(),
        status: 'deleted'
      }))
    ).subscribe((_res) => {
        this._modalCtrl.success(`Item removed and anomaly marked as resolved`)
        this.onRefresh()
      }
    )
  }

  //MOVE JOB LINE ITEM TO ANOMALY CHECK
  moveJobLineItemToAnomaly(jobLineItem: JobLineItem, action, confirmMessage ){
    const updates ={action: action, actionCreatedAt: new Date(), status: 'pending'}
    this._modalCtrl.confirm(confirmMessage).pipe(
      filter(res=> res),
      switchMap(res => this._api.updateJobLineItem(jobLineItem.ID, updates))
    ).subscribe( _res => {
        this._modalCtrl.success('Item moved to anomalies')
        //TODO play sound
        this.onRefresh()
      }
    )
  }

  //CREATE JOB LINE ITEM WITH ANOMALY CHECK
  createJobLineItemAnomaly(item : Item, action, confirmMessage ){
    const jobLineItem ={
      itemID :item.ID,
      productID: item.product.ID,
      productVariantID: item.variant.ID,
      jobID: this.jobID,
      status: 'pending',
      actionCreatedAt: new Date(),
      action: action,
      notes: null,
      inventoryID: item.inventoryID,
      warehouseID : this.job.warehouseID
    }
    this._modalCtrl.confirm(confirmMessage).pipe(
      filter(res=> res),
      switchMap(res => this._api.createJobLineItem(jobLineItem))
    ).subscribe( _res => {
        this._modalCtrl.success('Item added to stock check and moved to anomalies')
        //TODO play sound
        this.onRefresh()
      }
    )
  }

  //UPDATE NOTES ON JLI
  onUpdateJobLineItemNotes(jobLineItem: JobLineItem){
    const title = jobLineItem.notes ? 'Update Job Item Notes' : 'Add Job Item Notes'
    this._modalCtrl.input({
      title: title,
      type: 'string',
      input: jobLineItem.notes,
    }).pipe(filter(res=> res),
      mergeMap((notes: string) => {
        return this._api.updateJobLineItem(jobLineItem.ID,  {notes: notes})
      })
    ).subscribe((notes) => {
      this._modalCtrl.success(`Job Item Notes Updated`)
      this.onRefresh()
    });
  }

  //CHANGE ITEM LOCATION - AUTO COMPLETES A TRANSFER TO THE RIGHT LOCATION
  changeItemLocation(jobLineItem: JobLineItem){
    this._modalCtrl.confirm(`Are you sure that you would like to transfer this item to ${jobLineItem.job.warehouse.name}`).pipe(filter(_res => _res)).subscribe((res)=> {
      if (res){
        const transferOrder = {
          type: 'transfer',
          accountID: this._user.account.ID,
          reference1: `stock-take-job#${this.jobID}`,
          consigneeID: jobLineItem.job.warehouse.addressID,
          consignorID: jobLineItem.item.warehouse.addressID,
          arrivalDate: new Date(),
          fulfillment: {
            setAsDispatched: true,
            setAsDelivered: true
          },
          details:[
            {itemID: jobLineItem.itemID}
          ]
        }
        this._api.createTransferOrder(transferOrder).subscribe(res => {
          this.resolveAnomaly(jobLineItem.ID)
          this._modalCtrl.confirm('Item location changed and anomaly resolved')
          this.onRefresh()
        })
      }
    })
  }
}
