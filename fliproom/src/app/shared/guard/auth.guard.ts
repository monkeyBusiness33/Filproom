import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { AuthService } from 'src/app/core/auth.service';
import { Events } from '../events';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(
    private _router: Router,
    private authApi: AuthService
  ) {
  }

  canActivate() {
    const isLogged = this.authApi.isLogged()
    if (isLogged) {
      return true
    } else {
      this.authApi.removeJWToken()
      this._router.navigate(['/signin'])
      return false
    }
  }
}
