import {Component, OnInit, ViewChild} from '@angular/core';
import {ApiService, QueryResponse} from "../core/api.service";
import {ActivatedRoute, Router} from "@angular/router";
import { IModalResponse, ModalService } from 'src/app/shared/modal/modal.service';
import {UserService} from "../core/user.service";
import { environment } from 'src/environments/environment';
import {Order} from "../shared/models/Order.model";
import {DataRequest, TableConfiguration, TableWrapperComponent} from "../shared/table-wrapper/table-wrapper.component";
import {Product, ProductVariant} from "../shared/models/Product.model";
import {FliproomListComponent} from "../shared/fliproom-list/fliproom-list.component";
import { filter, map, mergeMap, catchError, finalize, delay } from 'rxjs/operators';
import { of } from 'rxjs';
import { InventoryRecord } from '../shared/models/InventoryRecord';
import { AnalyticsService } from '../core/analytics.service';
import * as moment from 'moment';


@Component({
  selector: 'app-products',
  templateUrl: './products.page.html',
  styleUrls: ['./products.page.scss'],
})
export class ProductsPage implements OnInit {

  @ViewChild('tableWrapper') tableWrapper:
  TableWrapperComponent;
  @ViewChild('fliproomList') fliproomList: FliproomListComponent;

  public environment = environment
  public tableConfigs: TableConfiguration = new TableConfiguration({
    columnsConfig: [],
    tableKey: 'products',
    showColumnsSelection: true,
    showAdvancedFilter: true,
    rowHoverable: true,
    emptyTablePlaceholder: 'No products available.',
    dataSourceFnName: 'getProductsList' // pass this to allow table download
  })
  public productViewColumnConfig;
  public variantViewColumnConfig;

  public buttons = []

  //TODO: currentSelectedSegment should change to more readable name to privateProduct = true/false (like variantMode)
  public dataRequested;
  public isLoading: boolean =  false;
  public currentSelectedSegment  = 'private'
  public productTypeTabsList: string[] = ['private', 'public']
  public currentSelectedType  = 'recommended'
  public publicProductFiltersTabsList: string[] = ['recommended', 'latest', 'upcoming']
  public variantMode = false

  // Delay time to simulate stockx product import
  private importingDelay = 5000

  constructor(
    private _api: ApiService,
    private _route: ActivatedRoute,
    private _modalCtrl: ModalService,
    private _router: Router,
    public user: UserService,
    public _analytics: AnalyticsService
  ) {
    this._route.queryParams.subscribe(params => {

      // Default product mode to private and variant mode disabled when URL is without params
      // Avoid user change URL manually and access to public view in variant mode
      if (Object.keys(params).length === 0 || (params.product_mode === 'public' && params.variant_mode === 'enabled')) {
        this._router.navigate(['/products'], { queryParams: { product_mode: 'private', variant_mode: 'disabled' } })
        return
      }

      // Set global variables with params
      this.currentSelectedSegment = params.product_mode && params.product_mode === 'public' ? 'public' : 'private';
      this.variantMode = params.variant_mode && params.variant_mode === 'disabled' ? false : true;

      this.loadTopButtons();
      this.loadTableConfig();
    })
  }

  ngOnInit() {
  }
  // Build top buttons array for desktop
  loadTopButtons() {
    this.buttons = [];

    if (!this.variantMode && this.currentSelectedSegment === 'private') {
      this.buttons.push({ label: 'variant mode', icon: 'auto_mode', id: 'variant-mode' });
    } else if (this.variantMode) {
      this.buttons.push({ label: 'product mode', icon: 'auto_mode', id: 'product-mode' });
    }

    if (this.user.iam.product.create) {
      this.buttons.push({ label: 'create', icon: 'add', id: 'create-product' });
    }

    if (this.currentSelectedSegment === 'public') {
      this.buttons.push({ label: 'private products', icon: 'lock', id: 'private-mode' });
    } else if (!this.variantMode) {
      this.buttons.push({ label: 'import product', icon: 'upload', id: 'public-mode' });
    }
  }


  loadTableConfig(){
    // config tables for private/public view mode
    if (this.currentSelectedSegment == 'public') {
      this.productViewColumnConfig = [
        { reference: 'imageReference', displayedName: 'Image', dataType: 'string', disableFilter: true },
        { reference: 'ID', displayedName: 'ID', dataType: 'string' },
        { reference: 'title', displayedName: 'Title', dataType: 'string' },
        { reference: 'category.name', displayedName: 'Category', dataType: 'string' },
        { reference: 'code', displayedName: 'Code', dataType: 'string' },
        { reference: 'createdAt', displayedName: 'Created At', dataType: 'date' },
        { reference: 'status', displayedName: 'Status', dataType: 'string' },
        { reference: 'sourceProductID', displayedName: 'Synced ID', dataType: 'string' },
        { reference: 'sourceProduct.title', displayedName: 'Synced Product', dataType: 'string' },
        { reference: 'releaseDate', displayedName: 'Release Date', dataType: 'date' },
        { reference: 'volatilityScore', displayedName: 'Volatility Score', dataType: 'number' },
        { reference: 'volatilityScoreChangePercentage', displayedName: 'Change Score', dataType: 'number' },
        { reference: 'salesLast72Hours', displayedName: 'Sales 72hs', dataType: 'number' },
      ]
    } else {
      this.productViewColumnConfig = [
        { reference: 'imageReference', displayedName: 'Image', dataType: 'string', disableFilter: true },
        { reference: 'ID', displayedName: 'ID', dataType: 'string' },
        { reference: 'title', displayedName: 'Title', dataType: 'string' },
        { reference: 'category.name', displayedName: 'Category', dataType: 'string' },
        { reference: 'code', displayedName: 'Code', dataType: 'string' },
        { reference: 'createdAt', displayedName: 'Created At', dataType: 'date' },
        { reference: 'status', displayedName: 'Status', dataType: 'string' },
        { reference: 'sourceProductID', displayedName: 'Synced ID', dataType: 'string' },
        { reference: 'sourceProduct.title', displayedName: 'Synced Product', dataType: 'string' },
      ]
    }

    this.variantViewColumnConfig = [
      { reference: 'product.imageReference', displayedName: 'Image', dataType: 'string', disableFilter: true },
      { reference: 'product.ID', displayedName: 'Product ID', dataType: 'string' },
      { reference: 'product.title', displayedName: 'Product Title', dataType: 'string' },
      { reference: 'product.category.name', displayedName: 'Category', dataType: 'string' },
      { reference: 'product.code', displayedName: 'Code', dataType: 'string' },
      { reference: 'product.createdAt', displayedName: 'Created At', dataType: 'date' },
      { reference: 'product.sourceProductID', displayedName: 'Synced Product ID', dataType: 'string' },
      { reference: 'product.sourceProduct.title', displayedName: 'Synced Product', dataType: 'string' },
      { reference: 'product.status', displayedName: 'Product Status', dataType: 'string' },
      { reference: 'ID', displayedName: 'ID', dataType: 'string' },
      { reference: 'name', displayedName: 'Name', dataType: 'string' },
      { reference: 'position', displayedName: 'Idx', dataType: 'string' },
      { reference: 'price', displayedName: 'Lowest Price', dataType: 'number' },
      { reference: 'gtin', displayedName: 'GTIN', dataType: 'string' },
      { reference: 'sourceProductVariantID', displayedName: 'Synced ID', dataType: 'string' },
      { reference: 'sourceProductVariant.name', displayedName: 'Synced Variant', dataType: 'string' },
      { reference: 'sourceProductVariant.price', displayedName: 'Market Price', dataType: 'number' },
      { reference: 'sourceProductVariant.updatedAt', displayedName: 'Last Sync', dataType: 'string' },
      { reference: 'status', displayedName: 'Status', dataType: 'string' },
    ]

    //set product view config
    this.tableConfigs.columnsConfig = !this.variantMode ? this.productViewColumnConfig : this.variantViewColumnConfig
    this.tableWrapper ? this.tableWrapper.ngOnInit() : null
  }

  ionViewWillEnter() {
    this.onRefresh()
  }

  onRefresh() {
    this.tableWrapper ? this.tableWrapper.refresh() : null
    this.fliproomList ? this.fliproomList.refresh() : null
  }

  // Triggered when filter product list in public view (Recommended/Latest)
  publicProductFilterChanged(evt){
    this.currentSelectedType = evt.detail.value;
    this.onRefresh()
  }

  onDataRequest(evt: DataRequest): void {
    const productType = this.currentSelectedSegment
    //product and variant mode data fetching
    //product view mode
    if(this.currentSelectedSegment == 'public'){
      if (this.currentSelectedType == 'recommended') {
        evt.sort = 'salesLast72Hours:desc'
      } else if (this.currentSelectedType == 'latest') {
        evt.sort = 'releaseDate:desc'
        evt.params['releaseDate'] = `:${moment().format('YYYY-MM-DD')}`
      } else if (this.currentSelectedType == 'upcoming') {
        evt.sort = 'releaseDate:asc'
        evt.params['releaseDate'] = `${moment().add(1, 'days').format('YYYY-MM-DD')}:${moment().add(14, 'days').format('YYYY-MM-DD')}`
      }
    }

    if (this.variantMode) {
      evt.params['product.status'] = evt.params['product.status'] ? evt.params['product.status'] : ['!deleted']
      //Filter order status based on current tab selected
      if (productType == "public") {
        evt.params['product.public'] = true
      }
      else {
        evt.params['product.public'] = false
        evt.params['product.accountID'] = this.user.account.ID
      }

      this._api.getVariantsList(evt.pageIdx, evt.pageSize, evt.sort, evt.params).subscribe((resp) => {
        this.dataRequested = resp;
        this.isLoading = false
      });
      return
    }

    // if product mode
    evt.params['status'] = evt.params['status'] ? evt.params['status']  : ['!deleted']

    //Filter order status based on current tab selected
    if (productType == "private") {
      evt.params['public'] = false
      evt.params['accountID'] = this.user.account.ID

      this._api.getProductsList(evt.pageIdx, evt.pageSize, evt.sort, evt.params).subscribe((resp) => {
        this.dataRequested = resp;
        this.isLoading = false;
      });
      return
    }

    // if public
    evt.params['public'] = true

    // Get the list of products
    let listOfProducts: Product[] = [];
    this._api.getProductsList(evt.pageIdx, evt.pageSize, evt.sort, evt.params).pipe(
      mergeMap((dataRequested: any) => {
        listOfProducts = dataRequested.data;

        // Get the inventory linked to the public products
        return this._api.getInventory(evt.pageIdx, evt.pageSize, null, {accountID: this.user.account.ID, "product.sourceProductID": dataRequested.data.map((product) => product.ID).join(",") })}),
      map((response: any) => {
        const inventoryData: InventoryRecord[] = response.data;

        // Iterate over each product to calculate and add the corresponding inventory
        const productsWithInventory = listOfProducts.map((product) => {
          // Filter the inventory corresponding to this product
          const productInventory = inventoryData.filter((inventoryItem) => inventoryItem.product.sourceProductID === product.ID);

          // Calculate quantities and variants for each product
          const quantitiesByVariantId: { [key: string]: number } = productInventory.reduce((acc, dataItem) => {
            const variantId = dataItem.productVariantID;
            const quantity = dataItem.quantity;

            if (acc.hasOwnProperty(variantId)) {
              acc[variantId] += quantity;
            } else {
              acc[variantId] = quantity;
            }

            return acc;
          }, {});

          // Create the final inventory object. If the quantity is 0, return null
          const quantity = Object.values(quantitiesByVariantId).reduce((acc, quantity) => acc + quantity, 0);
          const productVariants = Object.keys(quantitiesByVariantId).length;
          const calculatedInventory = quantity === 0 ? null : {
            quantity,
            productVariants
          };

          // Add the inventory object to the product
          return {
            ...product,
            calculatedInventory
          };
        });

        // Return the list of products with their respective calculated inventories
        return { data: productsWithInventory };
      })
    ).subscribe((dataRequested) => {
      dataRequested ? this.dataRequested = dataRequested : this.dataRequested = [];
      this.isLoading = false;
    });
  }

  //Edit product
  onProductClick(product: Product) {
    if(this.currentSelectedSegment == 'public') {
      this.onPublicProductClick(product);
      return
    }
    this.onOpenProductForm(product)
  }

  /**
   * Click event
   * - Desktop: top menu buttons
   * - Mobile: Actionsheet
   */

  onButtonClick(buttonId: string) {
    this.isLoading = true;
    if (this.environment.screenType == 'desktop') this.dataRequested = { rows: [], count: 0 };
    if (buttonId == 'create-product') {
      this.onOpenProductForm()
    }
    else if (buttonId == 'product-mode') {
      this.tableConfigs.columnsConfig = this.productViewColumnConfig
      this.tableConfigs.tableKey = 'products'
      this.tableConfigs.emptyTablePlaceholder = 'No products available.'
      this.tableConfigs.dataSourceFnName = 'getProductsList'
      this._router.navigate(['/products'], { queryParams: { product_mode: this.currentSelectedSegment, variant_mode: 'disabled' } })
    }
    else if (buttonId == 'variant-mode') {
      this.tableConfigs.columnsConfig = this.variantViewColumnConfig
      this.tableConfigs.tableKey = 'product-variants'
      this.tableConfigs.emptyTablePlaceholder = 'No product variants available.'
      this.tableConfigs.dataSourceFnName = 'getVariantsList'
      this._router.navigate(['/products'], { queryParams: { product_mode: this.currentSelectedSegment, variant_mode: 'enabled' } })
    }
    else if (buttonId == 'private-mode') {
      this._router.navigate(['/products'], { queryParams: { product_mode: 'private', variant_mode: this.variantMode ? 'enabled' : 'disabled' } })
      this.loadTableConfig();
    }
    else if (buttonId == 'public-mode') {
      this._analytics.trackEvent('import_product_view')
      this._router.navigate(['/products'], { queryParams: { product_mode: 'public', variant_mode: 'disabled' } })
      this.loadTableConfig();
    }
    this.loadTopButtons();
    this.environment.screenType == 'mobile' && this.onRefresh()
    this.isLoading = false
  }

  onOpenHelp() {
    this._modalCtrl.help('products').subscribe(() => {})
  }

  onOpenProductForm(product:Product = null){
    //default sets form to 'create' type
    let queryParams = {formType: 'create'}
    // if public product is edited
    if (product && product.public ) {
      //if user tries to select public product but has no permission to create products
      if (!this.user.iam.product.create){
        this._modalCtrl.warning('You are not authorized to create a product using a template')
        return
      }
      queryParams['productID'] = product.ID
      this._router.navigate(['/products/form'], { queryParams: queryParams })

    } else if (product && !product.public) { //if private product edited
      queryParams['formType'] = 'update',
      queryParams['productID'] = product.ID
      this._router.navigate(['/products/form'], {queryParams: queryParams})
    } else {
      this._router.navigate(['/products/form'], {queryParams: queryParams})
    }
  }

  // Product options Actionsheet

  onProductOptionsClick(){
    const actions = []
    // Add actions
    if(this.currentSelectedSegment == 'private'){
      actions.push({icon: 'info', title: 'Import product', description: '', disabled: false, key: 'import-product'})
    } else {
      actions.push({ icon: 'info', title: 'Private products', description: '', disabled: false, key: 'private-products' })
    }
    actions.push({icon: 'info', title: 'Add blank product', description: '', disabled: false, key: 'add-blank-product'})
    if (this.variantMode && this.currentSelectedSegment == 'private'){
      actions.push({icon: 'info', title: 'View by product', description: '', disabled: false, key: 'view-by-product'})
    } else if (!this.variantMode && this.currentSelectedSegment == 'private') {
      actions.push({icon: 'info', title: 'View by variant', description: '', disabled: false, key: 'view-by-variant'})
    }

    this._modalCtrl.actionSheet('Actions', actions).pipe(
      filter((resp: IModalResponse) => resp.role == "submit"),
      map((resp: IModalResponse) => resp.data),
      ).subscribe((action: string) => {
        switch(action) {
          case 'import-product':
          this.onButtonClick('public-mode')
          break;
          case 'private-products':
          this.onButtonClick('private-mode')
          break;
          case 'add-blank-product':
          this.onButtonClick('create-product')
          break;
          case 'view-by-variant':
          this.onButtonClick('variant-mode')
          break;
          case 'view-by-product':
          this.onButtonClick('product-mode')
          break;
        }
      })
  }

  /**
   * Create private product and takes user to add inventory
   * @param rawProduct
   * - Add properties missing in rawProduct
   * - Delete unnecessary properties
   * - Update variant properties
   * - Create product and get private ID
   * - Add inventory page
   */

  onSellProduct(rawProduct) {
    //Create private product and add inventory
    //Add Properties
    rawProduct['accountID'] = this.user.account.ID;
    rawProduct['category'] = rawProduct.category.name;
    rawProduct['sourceProductID'] = rawProduct.ID;
    rawProduct['public'] = 0;

    //Detete properties
    delete rawProduct.stockxId
    delete rawProduct.salesLast72Hours
    delete rawProduct.salesLast72HoursChangePercentage
    delete rawProduct.lastSalePrice
    delete rawProduct.lastSaleChangePercentage
    delete rawProduct.volatilityScore
    delete rawProduct.volatilityScoreChangePercentage

    // Function to update Variant properties
    const updateVariantProperties = (variant) => {
      delete variant.stockxId;
      delete variant.price;
      variant.sourceProductVariantID = variant.ID;
    };

    // Update Variant properties if product has no variants
    if (!rawProduct.variants) {
      this._api.getProduct(rawProduct.ID).subscribe((product: Product) => {
        product.variants.forEach(updateVariantProperties);
        this.onCreateProduct(rawProduct);
      });
      // Update Variant properties if product has variants
    } else {
      rawProduct.variants.forEach(updateVariantProperties);
      this.onCreateProduct(rawProduct);
    }
  }

  onCreateProduct(rawProduct){
    this._api.createProduct(rawProduct).subscribe((product: Product) => {
      this._router.navigate([`inventory/bulk/create/product/${product.ID}`], {queryParams: { formType: 'create', inventoryType: 'stock' }})
    })
  }

  onViewProductStock(product){
    //This method is when we already know that the product has stock
    let queryParams = {
      public: false,
      accountID: this.user.account.ID,
      sourceProductID: product.ID,
      status: '!deleted'
    }
    //Get private product ID from public product
    this._api.getProductsList(0, 1, null, queryParams).subscribe((res) => {
      //Go to inventory form
      this._router.navigate([`/inventory/product/${!this.variantMode ? res.data[0].ID : res.data[0].product.ID}`]);
    });

  }

  onPublicProductClick(product: Product) {
    const actions = []
    // Add actions
    // Customize product => open the product in the product form before creating
    actions.push({ icon: 'info', title: 'Customize product', description: '', disabled: false, key: 'customize-product' })
    // Sell Product => sends to the inventory form with the product already selected
    actions.push({ icon: 'info', title: 'Sell product', description: '', disabled: false, key: 'sell-product' })
    // If the product was imported previously
    if (product['calculatedInventory']) {
      actions.push({ icon: 'info', title: 'View stock', description: '', disabled: false, key: 'view-stock' })
    }

    
    this._modalCtrl.actionSheet('Actions', actions).pipe(
      filter((resp: IModalResponse) => resp.role == "submit"),
      map((resp: IModalResponse) => resp.data),
      ).subscribe((action: string) => {
        switch (action) {
          case 'view-stock':
            this._analytics.trackEvent('product_view_stock')
            this.onViewProductStock(product)
          break;
          case 'customize-product':
            this._analytics.trackEvent('product_customize')
            this.onOpenProductForm(product);
            break;
          case 'sell-product':
            this._analytics.trackEvent('product_sell', {productID: product.ID})
            this.onSellProduct(product)
          break;
        }
      })
  }

  //action if public catalogue is empty
  onStockxImportRequest() {
    // enabled only if list is using public products. request import of a stockx product from its url
    this._modalCtrl.input({ title: 'stockx url', subtitle: 'past here the url of the stockx product to import', type: 'string' }).pipe(
      filter(res => res),
      mergeMap(unformattedStockxUrl => {
        this._modalCtrl.progress({ title: 'Don\'t close this popup', subtitle: 'Scanning the web for the product. It will take some time. </br>Please be patient.', status:'loading', counter:true})
        return this._api.stockxApiImportRequest(unformattedStockxUrl).pipe(
          catchError(error => {
            //TODO: API is throwing a 500 error when the product is not found. Remove when the problem will be fixed in API
            if(error.status = 500) {
              this._modalCtrl.close();
              this._modalCtrl.progress({ title: 'Product not found', subtitle: 'Be sure to have imported a valid url', status: 'error', cancel: 'close' })
            }
            return of(null);
          }),
          )
        })
      )
      .subscribe((res) => {
        if (res && res.length > 0) {
          this._modalCtrl.close();
          this._modalCtrl.progress({ title: 'Don\'t close this popup', subtitle: 'Product found. Importing the product into the public catalogue.', status: 'loading', counter:true });
          // Delay simulation importing the catalog
          setTimeout(() => {
            this._modalCtrl.close();
            this._modalCtrl.progress({ title: 'Product imported', subtitle: 'Completed', status: 'complete', confirm: 'Close' });
            this.onRefresh();
          }, this.importingDelay);
        }
      });

  }
}
