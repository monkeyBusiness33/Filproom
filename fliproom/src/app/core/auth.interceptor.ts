import { Injectable } from '@angular/core';
import {
  HttpInterceptor,
  HttpHandler,
  HttpRequest,
  HttpEvent,
  HttpErrorResponse,
} from '@angular/common/http';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { catchError, filter, map, switchMap, take, tap } from 'rxjs/operators';
import { ApiService } from './api.service';
import { environment } from 'src/environments/environment';
import { ModalService } from '../shared/modal/modal.service';
import { AuthService } from './auth.service';

export interface RefreshTokenResponse {
  refreshedToken: string;
}

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  public isRefreshing: boolean = false;
  private refreshTokenSubject: BehaviorSubject<any> = new BehaviorSubject<any>(
    null
  );

  constructor(
    private _authApi: AuthService,
    private _api: ApiService,
    private _modalCtrl: ModalService,
  ) {}

  intercept(
    request: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    if (!request.url.includes('google.com') && !request.url.includes('www.googleapis.com')) {
      request = this._setHeaders(request);
    }

    return next.handle(request).pipe(
      catchError((response: HttpErrorResponse) => {
        if (response.status == 0) {
          this._modalCtrl.error('NO INTERNET CONNECTION');
        } else if (response.status == 401) {
          this._modalCtrl.error(`${response.status} - ${response.error.error}`);
          this._authApi.signOut(true);
        } else if (response.status == 403) {
          this._modalCtrl.warning(`${response.status} - ${response.error.error}`);
        } else if (response.status == 409) { //email already in use

        } else if (response.status == 404) {

        } else {
          this._modalCtrl.error(`${response.error.error} (${response.status})`);
        }
        return throwError(response);
      })
    );
  }

  private _setHeaders(request) {
    // Add the JWT to any request
    if (this._authApi.getJWToken()) {
      return request.clone({
        setHeaders: {
          Authorization: `Bearer ${this._authApi.getJWToken()}`,
          sessionId: `${environment.sessionId}`, // unique frontend identifier for the user session
          'app-version': `${environment.appVersion}`, // track the version number of the app from which the request is coming from
          'origin-url': `${window.location.href}`, // add exact url (not only hostname) to the request - used for debug purposes to where where exactly the requests are coming from
        },
      });
    }

    return request.clone({
      setHeaders: {
        sessionId: `${environment.sessionId}`,
        'app-version': `${environment.appVersion}`,
      },
    });
  }
}
