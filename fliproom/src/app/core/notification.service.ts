import { Injectable } from '@angular/core'
import { Router } from '@angular/router'

import { ModalService } from '../shared/modal/modal.service'

import { Capacitor } from '@capacitor/core'

import {
  ActionPerformed,
  PushNotificationSchema,
  PushNotifications,
  Token
} from '@capacitor/push-notifications'

import { getMessaging, onMessage, getToken } from 'firebase/messaging'

import { environment } from 'src/environments/environment'
import { UserService } from './user.service'
import { AnalyticsService } from "./analytics.service";

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  constructor (
    private _modalCtrl: ModalService,
    private _router: Router,
    private user: UserService,
    private _analytics: AnalyticsService
  ) {}

  init () {
    /**
     * Initiliaze push notifications
     * Request Permissions
     * Fetch Device ID and save it
     * Subscribe to push notifications
     */
    // Check if the platform is capable of receiving push notifications through Capacitor
    if (environment.platform == "web") {
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      if (isSafari) {
        this._modalCtrl.warning('Safari Browser does not supports in-app notifications. We suggest the use of Chrome')
        return
      }

      // Requesting permissions and get deviceID
      const messaging = getMessaging()
      getToken(messaging, { vapidKey: environment.firebaseConfig.voluntaryApplicationServerIdentification })
      .then(currentToken => {
        console.log("[DEBUG] notification - registration response. DeviceID:", currentToken)
        localStorage.setItem('deviceID', currentToken)
        environment.deviceID = currentToken

        // Subscribe to push notifications
        onMessage(messaging, payload => {
          this.showNotification(payload.notification)
        })
      })
      .catch(err => {
        console.log(err)
        this._modalCtrl.warning('Notifications Disabled. Enable them in the settings')
      })
    } else {
      // get deviceID
      PushNotifications.addListener('registration', (token: Token) => {
        console.log("[DEBUG] notification - registration response. DeviceID:", token.value)
        localStorage.setItem('deviceID', token.value)
        environment.deviceID = token.value
      })

      console.log("[DEBUG] notification - checkPermissions")
      PushNotifications.checkPermissions()
      .then(result => {
        // if permissions never requested or rejected - request permissions
        return result.receive != 'granted'
      })
      .then((requestPermissions) => {
        if (requestPermissions) {
          return PushNotifications.requestPermissions()
        } else {
          return Promise.resolve({receive: 'granted'}) //if no need to request permissions
        }
      })
      .then((result) => {
        if (result.receive === 'granted') { // if allow notifications
          PushNotifications.register()
        }
      })

      // Subscribe to push notifications
      PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
        this.showNotification(notification)
      })

      PushNotifications.addListener('pushNotificationActionPerformed', (notificationAction: ActionPerformed) => {
          const { notification } = notificationAction
          this._analytics.trackEvent('notification_click', {notificationType: notification.data.notificationType})
          if (notification.data.action === 'REDIRECT') {
            this._router.navigate([
              notification.data.panel + notification.data.id
            ])
          }
        }
      )
    }
  }

  showNotification (notification) {
    let skipNotification = false
    //TODO: enable once comet chat own message issue sorted
    if (this.user && notification.title && notification.title.includes('@')){
      const segmented = notification.title.split('@')
      const groupInfo = segmented[1].trim()
      const splitIDs = groupInfo.split('-')
      skipNotification = !!splitIDs.find(ID => this.user.account.ID == Number(ID))
    }
    if(!skipNotification){
      this._modalCtrl.info(notification.body)
    }
  }
}
