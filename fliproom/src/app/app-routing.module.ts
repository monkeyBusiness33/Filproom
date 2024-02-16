import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { UserResolver } from './core/user.resolver';
import { AuthGuard } from './shared/guard/auth.guard';

const routes: Routes = [
  {
    path: 'signin',
    loadChildren: () => import('./auth/signin/signin.module').then(m => m.SigninPageModule)
  },
  {
    path: 'signup',
    loadChildren: () => import('./auth/signup/signup.module').then(m => m.SignupPageModule)
  },
  {
    path: 'forgot-password',
    loadChildren: () => import('./auth/forgot-password/forgot-password.module').then( m => m.ForgotPasswordPageModule)
  },
  {
    path: 'share/order/:orderID',
    loadChildren: () => import('./public/customer-order/customer-order.module').then( m => m.CustomerOrderPageModule)
  },
  {
    path: '',
    loadChildren: () => import('./navigation/navigation.module').then( m => m.NavigationPageModule),
    canActivate: [AuthGuard],
    resolve: { user: UserResolver }
  },
  {path: '**', redirectTo: ''},

];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
