import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { ModalService } from '../shared/modal/modal.service';
import { UsersnapService } from './usersnap.service';
import { from, Observable, of, Subject } from 'rxjs';
import { FirebaseAuthentication, SignInResult } from '@capacitor-firebase/authentication';

@Injectable({
  providedIn: 'root'
})

export class AuthService {
  public authStateChanges = new Subject<any>();
  private JWTOKENNAME = 'fliproom-jwt';
  private authProvider: string; //google, apple

  constructor(
    private _router: Router,
    private _modalCtrl: ModalService,
    private _http: HttpClient,
    private _userSnap: UsersnapService
  ) {

    FirebaseAuthentication.addListener('authStateChange', (response) => {
      if (response.user) {
        this.authStateChanges.next({user: response.user, authProvider: this.authProvider})
      }
    })
  }

  async googleSignIn() {
    this.authProvider = 'google'
    await FirebaseAuthentication.signInWithGoogle({
      mode: environment.isCordovaAvailable ? 'redirect' : 'popup'
    })
  }

  async appleSignIn_v2() {
    this.authProvider = 'apple'
    await FirebaseAuthentication.signInWithApple();
  }

  getFirebaseJWToken() {
    return from(FirebaseAuthentication.getIdToken())
  }

  signIn(body, firstSession=false) {
    let deviceID = localStorage.getItem('deviceID') || environment.deviceID

    //Only replace device ID if a new one is available
    if(deviceID) {
      body.deviceID = deviceID
    }

    return new Observable((subscriber) => {
      this._http.post<any>(environment.apiUrl + 'auth/signin', body).subscribe({
        next: res => {
          if (res.valid) {
            this.setJWToken(res['jwt'])

            const params = {}

            if (firstSession) {
              params['firstSession'] = true
            }
            this._router.navigate(['/'], {replaceUrl: true, queryParams: params})
          } else {
            this._modalCtrl.warning('Wrong email/password or account doesn\'t exists')
          }
          subscriber.next()
          subscriber.complete()
        },
        error: err => subscriber.error(err)
      })
    })
  }

  signUp(data) {
    return this._http.post<any>(environment.apiUrl + 'auth/signup', data)
  }

  async signOut(redirect = false) {
    // signout ouser, if redirect = true send also to login page.
    // this param is optinal because on signin we have to clean the cached logged accountn sometimes, without redirecting
    this.removeJWToken();
    localStorage.clear();
    this._userSnap.destroy();
    await FirebaseAuthentication.signOut();
    if (redirect) {
      this._router.navigate(['/signin'], {replaceUrl: true});
    }
  }

  isLogged(): boolean {
    return !!localStorage.getItem(this.JWTOKENNAME);
  }

  setJWToken(jwt: string) {
    localStorage.setItem(this.JWTOKENNAME, jwt);
  }

  getJWToken() {
    return localStorage.getItem(this.JWTOKENNAME);
  }

  removeJWToken() {
    localStorage.removeItem(this.JWTOKENNAME);
  }
}
