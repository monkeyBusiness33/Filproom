import { Injectable } from '@angular/core'

import { CometChat } from '@cometchat-pro/chat'

import { environment } from 'src/environments/environment'
import * as enums from "../../cometchat-pro-angular-ui-kit/CometChatWorkspace/src/utils/enums";
import {logger} from "../../cometchat-pro-angular-ui-kit/CometChatWorkspace/src/utils/common";

@Injectable({
  providedIn: 'root'
})
export class CometchatService {
  constructor() {}

  init (): void {
    console.log('Cometchat Initialized: ', CometChat.isInitialized())
    if (!CometChat.isInitialized()) {
      const appSetting = new CometChat.AppSettingsBuilder()
        .subscribePresenceForAllUsers()
        .setRegion(environment.cometChat.region)
        .build()
      CometChat.init(environment.cometChat.appID, appSetting).then(
        () => {
          console.log('Initialization completed successfully')
          // You can now call login function.
        },
        error => {
          console.log('Initialization failed with error:', error)
          // Check the reason for error and take appropriate action.
        }
      )
    }
    else{
      console.log('Cometchat Already Initialised')
    }
  }

  createUser (_user): void {
    let ID = (_user.account.ID).toString()
    let deviceID = _user.deviceID
    var user = new CometChat.User(ID)
    user.setName(_user.account.name)
    CometChat.createUser(user, environment.cometChat.authKey).then(
      user => {
        console.log('user created', user)
        this.loginUser(ID, deviceID)
      },
      error => {
        if (error.code == 'ERR_UID_ALREADY_EXISTS'){
          console.log('Account already exists login')
          this.loginUser(ID, deviceID)
        }
        else{
          console.log('error', error)
        }
      }
    )
  }

  loginUser(ID: string, deviceID): void{
      this.init()
        console.log('Comet Chat Init:', CometChat.isInitialized() , 'LOGGING IN')
        CometChat.login(ID, environment.cometChat.authKey).then(
          user => {
            console.log('Login Successful:', {user})
            CometChat.registerTokenForPushNotification(deviceID)
          },
          error => {
            console.log( error)
            //attempt to create account
            if (error.code == 'ERR_UID_NOT_FOUND') {
              console.log('User does not exist yet')
            }
            else {
              console.log('Login failed with exception:', {error})
            }
          })
  }



  /**
   * Send Text Message
   * @param
   */
  sendTextMessageGroup(groupUID, messageList: string[] ): boolean {
    console.log('Sending Automated Message')
    for(let messageString of messageList){
      try {
        let textMessage: any = new CometChat.TextMessage(
          groupUID,
          messageString,
          CometChat.RECEIVER_TYPE.GROUP
        )
        CometChat.sendMessage(textMessage)
          .then(message => {
            return message
          })
          .catch(error => {
            logger('Message sending failed with error:', error)
          })
      } catch (error) {
        console.log(error)
        logger(error)
      }
    }
    return true
  }

  //UTILS
  delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
  }

}
