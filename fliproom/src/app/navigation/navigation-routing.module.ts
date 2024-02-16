import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { ItemDetailsComponent } from '../shared/components/item-details/item-details.component';

import { NavigationPage } from './navigation.page';

const routes: Routes = [
  //redirect logic moved inside the navigation.page
  {
    path: '',
    component: NavigationPage,
    children: [
      {
        path: 'dashboard',
        loadChildren: () => import('src/app/dashboard/dashboard.module').then( m => m.DashboardPageModule)
      },
      {
        path: 'transfers',
        loadChildren: () => import('src/app/transfers/transfers.module').then( m => m.TransfersPageModule)
      },
      {
        path: 'orders',
        loadChildren: () => import('src/app/orders/orders.module').then( m => m.OrdersPageModule)
      },
      {
        path: 'payments',
        loadChildren: () => import('src/app/payments/payments.module').then( m => m.PaymentsPageModule)
      },
      {
        path: 'listings',
        loadChildren: () => import('src/app/listings/listings.module').then( m => m.ListingsPageModule)
      },
      {
        path: 'inventory',
        loadChildren: () => import('src/app/inventory/inventory.module').then( m => m.InventoryPageModule)
      },
      {
        path: 'marketplace',
        loadChildren: () => import('src/app/marketplace/marketplace.module').then( m => m.MarketPlacePageModule)
      },
      {
        path: 'settings',
        loadChildren: () => import('src/app/settings/settings.module').then( m => m.SettingsPageModule)
      },
      {
        path: 'products',
        loadChildren: () => import('src/app/products/products.module').then(m => m.ProductsPageModule)
      },
      {
        path: 'warehousing',
        loadChildren: () => import('src/app/warehousing/warehousing.module').then( m => m.WarehousingPageModule)
      },      
      {
        path: 'reports',
        loadChildren: () => import('src/app/reports/reports.module').then( m => m.ReportsPageModule)
      },    
      {
        path: 'sale-channels',
        loadChildren: () => import('src/app/sale-channels/sale-channels.module').then( m => m.SaleChannelsPageModule)
      },
      {
        path: 'integrations',
        loadChildren: () => import('src/app/integrations/integrations.module').then(m => m.IntegrationsPageModule)
      },
      {
        path: 'items/:ID',
        component: ItemDetailsComponent
      },
    ]
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class NavigationPageRoutingModule {}
