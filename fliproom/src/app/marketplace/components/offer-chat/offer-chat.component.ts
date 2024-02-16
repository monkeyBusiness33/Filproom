import {Component, ElementRef, EventEmitter, Input, OnInit, Output, SimpleChanges, ViewChild} from '@angular/core';
import {ApiService} from "../../../core/api.service";
import {ActivatedRoute, Router} from "@angular/router";
import {IModalResponse, ModalService} from "../../../shared/modal/modal.service";
import {UserService} from "../../../core/user.service";
import { environment } from 'src/environments/environment';
import {MarketplaceOffer} from "../../../shared/models/MarketplaceOffer";
import {filter, map} from "rxjs/operators";
import {
  MarketplaceAddOfferFormComponent
} from "../../marketplace-detail/listing-offer-form/listing-offer-form.component";
import {CometchatService} from "../../../core/cometchat.service";
import { OUTGOING_MESSAGE_SOUND } from "src/cometchat-pro-angular-ui-kit/CometChatWorkspace/src/resources/audio/outgoingMessageSound";
import { COMETCHAT_CONSTANTS } from "src/cometchat-pro-angular-ui-kit/CometChatWorkspace/src/utils/messageConstants";
import {logger} from "../../../../cometchat-pro-angular-ui-kit/CometChatWorkspace/src/utils/common";
import * as enums from "../../../../cometchat-pro-angular-ui-kit/CometChatWorkspace/src/utils/enums";
import {CometChat} from "@cometchat-pro/chat";
import {
  INCOMING_MESSAGE_SOUND
} from "../../../../cometchat-pro-angular-ui-kit/CometChatWorkspace/src/resources/audio/incomingMessageSound";
import {ImageViewerComponent} from "../../../shared/components/image-viewer/image-viewer.component";

@Component({
  selector: 'app-offer-chat',
  templateUrl: './offer-chat.component.html',
  styleUrls: ['./offer-chat.component.scss'],
})
export class OfferChatComponent implements OnInit {

  public environment = environment
  @Input() selectedOffer: MarketplaceOffer
  @Output() offerRefreshed: EventEmitter<any> = new EventEmitter();
  @ViewChild('imagePicker', { static: false }) imagePicker!: ElementRef
  @ViewChild('videoPicker', { static: false }) videoPicker!: ElementRef
  @ViewChild('audioPicker', { static: false }) audioPicker!: ElementRef
  @ViewChild('filePicker', { static: false }) filePicker!: ElementRef
  @ViewChild('messageWindow') private chatWindow: ElementRef;


  //COMET CHAT VARS
  ATTACH_FILE: string = COMETCHAT_CONSTANTS.ATTACH_FILE
  ATTACH_VIDEO: string = COMETCHAT_CONSTANTS.ATTACH_VIDEO
  ATTACH_IMAGE: string = COMETCHAT_CONSTANTS.ATTACH_IMAGE
  ENTER_YOUR_MESSAGE_HERE: string = COMETCHAT_CONSTANTS.ENTER_YOUR_MESSAGE_HERE

  enableSendButton = false
  enableReaction = true
  messageSending: boolean = false
  messageInput = ''
  messageType = ''
  checkAnimatedState = 'normal'
  messageList: any = [];
  scrollToBottom: boolean = true;
  // To display image in full screen
  public imageView = null
  //If clicked then only show image in full screen
  public fullScreenViewImage: boolean = false
  reachedTopOfConversation = false;


  emojiToggled: boolean = false
  isTyping: any
  userBlocked: boolean = false

  cometChatUser = null
  selectedCometChatGroup= null
  chatType = null



  constructor(
    private _api: ApiService,
    private _route: ActivatedRoute,
    private _modalCtrl: ModalService,
    private _router: Router,
    private _cometChat: CometchatService,
    public user: UserService,
  ) { }

  ngOnInit() {
    CometChat.getLoggedinUser().then((user) => {
      this.cometChatUser = user;
    });
  }

  ngOnChanges(change: SimpleChanges) {
    try {

      if (change[enums.GROUP_MESSAGE]) {
        if (change[enums.GROUP_MESSAGE].currentValue.length > 0) {
          this.appendMessage(change[enums.GROUP_MESSAGE].currentValue);
        }
      }

    } catch (error) {
      logger(error);
    }
  }


  getOfferStatusTagColour(status){
    if(status == 'approved'){
      return 'success'
    }
    else if (status == 'declined'){
      return 'error'
    }
    else {
      return 'warning'
    }
  }


  offerHeaderClicked (offer: MarketplaceOffer) {
    const actions = [{icon: 'view', title: 'View Listing', description: '', disabled: false, key: 'view'}]
    // no actions allowed if listing has been claimed already or offer is not pending or user not ownes either the listing or the offer
    if (
      (this.user.ID === offer.marketplaceListing.userID && this.user.ID == offer.userID)
    ) {
      return
    }

    // offer's actions for the listing owner
    if (this.user.ID === offer.marketplaceListing.userID) {
      if (offer.status.name === 'pending') {
        actions.push({icon: 'done', title: 'Decline', description: '', disabled: false, key: 'decline'})
        actions.push({icon: 'done', title: 'Accept', description: '', disabled: false, key: 'accept'})
      }
    } else if (this.user.ID == offer.userID) {
      // offer's action for your offer
      if(offer.status.name === 'pending'){
        actions.push({icon: 'done', title: 'Update', description: '', disabled: false, key: 'update'})
      }
      actions.push({icon: 'done', title: 'Delete', description: '', disabled: false, key: 'delete'})
    }

    this._modalCtrl
      .actionSheet('Actions', actions)
      .pipe(filter((resp: IModalResponse) => resp.role == 'submit'), map((resp: IModalResponse) => resp.data))
      .subscribe((action: string) => {
        switch (action) {
          case 'view':
            this._router.navigate(['/marketplace/detail/' + offer.marketplaceListing.ID])
            break
          case 'update':
            this._modalCtrl
              .open(MarketplaceAddOfferFormComponent, {
                list: this.selectedOffer.marketplaceListing,
                offer: this.selectedOffer
              })
              .subscribe(() =>  this.refreshOffer())
            break
          case 'accept':
            this.updateOfferStatus(offer, 'approved')
            this._modalCtrl.success('Offer Accepted')
            this._cometChat.sendTextMessageGroup(offer.cometChatGroup.guid, [`[OFFER APPROVED]`])
            break

          case 'decline':
            this.updateOfferStatus(offer, 'declined')
            this._modalCtrl.input({title: 'Reason for offer rejection', subtitle: null, type: 'string', input: null,}).subscribe(res => {
              this._cometChat.sendTextMessageGroup(offer.cometChatGroup.guid, [`[OFFER DECLINED] ${res}`])
              this._modalCtrl.success('Offer Declined')
            })
            break
          case 'delete':
            this._modalCtrl
              .confirm('You sure you want to delete this offer?')
              .pipe(filter(res => res))
              .subscribe(() => {
                this.updateOfferStatus(offer, 'deleted')
                this._cometChat.sendTextMessageGroup(offer.cometChatGroup.guid, [`[OFFER DELETED]`])
                this._modalCtrl.success('Offer deleted')
              })
            break
        }
      })
  }

  refreshOffer( ) {
    this.offerRefreshed.emit()
  }

  updateOfferStatus (offer: MarketplaceOffer, status: string) {
    this._api
      .updateMarketplaceListingOffer(offer.ID, { status: status })
      .subscribe(() => this.refreshOffer())
  }

  get offerType(){
    return this.selectedOffer.marketplaceListing.user.account.ID != this.user.account.ID ? 'sent': 'received'
  }


  //COMET CHAT ACTIONS
  /**
   * Load chat
   */

  loadChat(offer: MarketplaceOffer){
    try {
      if (this.checkAnimatedState !== null) {
        this.checkAnimatedState == 'normal' ? (this.checkAnimatedState = 'animated') : (this.checkAnimatedState = 'normal')
      }
      CometChat.getLoggedinUser().then(user => {
        this.cometChatUser = user
        CometChat.getGroup(offer.cometChatGroup.guid).then(
          group => {
            this.selectedCometChatGroup = group
            // //Close Thread And User Detail Screen When Chat Window Is Changed
            // this.closeThreadMessages()
            //this.viewDetailScreen = false
            this.chatType = CometChat.RECEIVER_TYPE.GROUP
            this.scrollToBottomOfChatWindow()

          },
          error => {
            console.log('Group details fetching failed with exception:', error)
          }
        )
      })
    } catch (error) {
      logger(error)
    }
  }



  /**
   * Opens drawer to send media files and sets animation state
   */
  toggleFilePicker (): boolean {
    try {
      //If user you are chatting with is blocked then return false
      if (this.userBlocked) {
        return false
      }
      this.checkAnimatedState == 'normal' ? (this.checkAnimatedState = 'animated') : (this.checkAnimatedState = 'normal')
    } catch (error) {
      logger(error)
    }
    return true
  }

  /**
   * Opens window to select and upload video
   */
  getVideo () {
    try {
      this.videoPicker.nativeElement.click()
    } catch (error) {
      logger(error)
    }
  }

  /**
   * Loads and upload the video
   * @param
   */
  onVideoChange (event: any): boolean {
    try {
      if (!event.target.files[0]) {
        return false
      }
      const uploadedFile = event.target.files[0]
      const reader: any = new FileReader()
      reader.addEventListener(
        enums.LOAD,
        () => {
          const newFile = new File([reader.result], uploadedFile.name, uploadedFile)
          this.sendMediaMessage(newFile, CometChat.MESSAGE_TYPE.VIDEO)
        },
        false
      )

      reader.readAsArrayBuffer(uploadedFile)

      this.videoPicker.nativeElement.value = ''
    } catch (error) {
      logger(error)
    }
    return true
  }

  /**
   * Sends media messages eg. image,audio,file etc.
   * @param
   */
  sendMediaMessage (messageInput: any, messageType: any): boolean {
    try {
      this.toggleFilePicker()
      if (this.messageSending) {
        return false
      }
      this.messageSending = true

      const { receiverId, receiverType } = this.getReceiverDetails()

      let mediaMessage: any = new CometChat.MediaMessage(receiverId, messageInput, messageType, receiverType)

      // if (this.parentMessageId) {
      //   mediaMessage.setParentMessageId(this.parentMessageId)
      // }

      mediaMessage.setSender(this.cometChatUser)
      mediaMessage.setReceiver(this.chatType)
      mediaMessage.setType(messageType)
      mediaMessage.setMetadata({[enums.FILE_METADATA]: messageInput})
      mediaMessage._composedAt = this.getUnixTimestamp()
      mediaMessage._id = this.randomID()

      this.messageSending = false

      CometChat.sendMessage(mediaMessage)
        .then(response => {
          this.messageSending = false
          console.log('appended media message')
          this.appendMessage([{ ...response, _id: mediaMessage._id }]);
          this.endTyping()
          this.playAudio()
          this.messageSent([{ ...response, _id: mediaMessage._id }]);
        })
        .catch(error => {
          this.messageSending = false
          logger('message sending failed with error Message_Composer ', error)
        })
    } catch (error) {
      logger(error)
    }
    return true
  }

  /**
   * Get Details of the User/Group , to whom , you want to send the message
   * @param
   */
  getReceiverDetails () {
    let receiverId
    let receiverType: any

    if (this.chatType == CometChat.RECEIVER_TYPE.USER) {
      receiverId = this.selectedOffer.cometChatGroup.uid
      receiverType = CometChat.RECEIVER_TYPE.USER
    } else if (this.chatType == CometChat.RECEIVER_TYPE.GROUP) {
      receiverId = this.selectedOffer.cometChatGroup.guid
      receiverType = CometChat.RECEIVER_TYPE.GROUP
    }

    return { receiverId: receiverId, receiverType: receiverType }
  }

  /**
   * When user stops writing
   */
  endTyping (metadata = null) {
    try {
      let { receiverId, receiverType } = this.getReceiverDetails()

      let typingMetadata = metadata || undefined

      let typingNotification = new CometChat.TypingIndicator(
        receiverId,
        receiverType,
        typingMetadata
      )
      CometChat.endTyping(typingNotification)

      clearTimeout(this.isTyping)
      this.isTyping = null
    } catch (error) {
      logger(error)
    }
  }


  /**
   * Handles all the actions emitted by the child components that make the current component
   * @param Event action
   */
  actionHandler(action: any) {
    try {
      let messages = action.payLoad;

      //let data = action.payLoad;

      switch (action.type) {

        case enums.CUSTOM_MESSAGE_RECEIVE:
        case enums.MESSAGE_RECEIVED: {
          const message = messages[0];
          this.scrollToBottomOfChatWindow();
          console.log('action handler message sent')
          this.appendMessage(messages);
          this.playAudio();
          break;
        }


        case enums.MESSAGE_FETCHED: {
          this.prependMessages(messages);
          break;
        }
        case enums.OLDER_MESSAGES_FETCHED: {

          this.reachedTopOfConversation = false;

          //No Need for below actions if there is nothing to prepend
          if (messages.length == 0) break;

          let prevScrollHeight = this.chatWindow.nativeElement.scrollHeight;

          this.prependMessages(messages);

          this.chatWindow.nativeElement.scrollTop = this.chatWindow.nativeElement.scrollHeight - prevScrollHeight;


          break;
        }
        case enums.MESSAGE_COMPOSED: {
          console.log('message composed')
          this.appendMessage(messages);
          break;
        }
        case enums.MESSAGE_SENT: {
          console.log('message sent')
          this.appendMessage(messages);
          this.messageSent(messages);
          break;
        }
        case enums.MESSAGE_UPDATED: {
          console.log('message updated')
          this.appendMessage(messages);
          break;
        }
        case enums.VIEW_ACTUAL_IMAGE: {
          this.toggleImageView(messages);
          break;
        }
        case enums.NEW_CONVERSATION_OPENED: {
          //this.resetPage();
          this.setMessages(messages);
          break;
        }

      }
    } catch (error) {
      logger(error);
    }
  }

  messageSent(messages:any) {
    const message = messages[0];
    const messageList = [...this.messageList];

    let messageKey = messageList.findIndex(m => m._id === message._id);
    if (messageKey > -1) {
      const newMessageObj = { ...message };
      messageList.splice(messageKey, 1, newMessageObj);
      messageList.sort((a, b) => a.id - b.id);
    }
    this.messageList = messageList;
    this.scrollToBottomOfChatWindow();
  }

  // /**
  //  * Resets The component to initial conditions
  //  * @param
  //  */
  // resetPage() {
  //   try {
  //     this.messageToBeEdited = null;
  //     this.replyPreview = null;
  //   } catch (error) {
  //     logger(error);
  //   }
  // }



  /**
   * append Messages that are sent
   * @param Any messages
   */
  appendMessage(messages: any) {
    try {
      let dummy = [...this.messageList];
      this.messageList = [...new Set([...dummy, ...messages])];
      this.scrollToBottomOfChatWindow();

    } catch (error) {
      logger(error);
    }
  }

  /**
   * Scrolls to bottom of chat window
   */
  scrollToBottomOfChatWindow() {
    try {
      if(this.chatWindow.nativeElement){
        setTimeout( res =>this.chatWindow.nativeElement.scrollTop =Math.max(0, this.chatWindow.nativeElement.scrollHeight - this.chatWindow.nativeElement.offsetHeight)
          , 500)
      }
    } catch (error) {
      logger(error);
    }
  }


  /**
   * Handles scroll of window
   * @param e
   */
  handleScroll(e: any) {
    try {
      const bottom =
        Math.round(e.currentTarget.scrollHeight - e.currentTarget.scrollTop) ===
        Math.round(e.currentTarget.clientHeight);

      const top = e.currentTarget.scrollTop === 0;

      if (top) {
        this.reachedTopOfConversation = top;
      }
    } catch (error) {
      logger(error);
    }
  }


  /**
   * Opens the clicked Image in full screen mode
   * @param Any message
   */
  toggleImageView (message: any) {
    try {
      console.log(message.data.url)
      this._modalCtrl.open(ImageViewerComponent, {url: message.data.url})
      // this.imageView = message
      // console.log(this.imageView)
      // this.fullScreenViewImage = !this.fullScreenViewImage

    } catch (error) {
      logger(error)
    }
  }

  /**
   * set Messages Directly , coz new conversation is opened , hence no need to prepend or append
   * @param Any messages
   */
  setMessages(messages: any) {
    try {
      this.messageList = [...messages];

      this.scrollToBottomOfChatWindow();
    } catch (error) {
      logger(error);
    }
  }

  /**
   * prepend Fetched Messages
   * @param Any messages
   */
  prependMessages(messages: any) {
    try {
      this.messageList = [...messages, ...this.messageList];
    } catch (error) {
      logger(error);
    }
  }

  /**
   * Opens window to select and upload image
   */
  getImage () {
    try {
      this.imagePicker.nativeElement.click()
    } catch (error) {
      logger(error)
    }
  }

  /**
   * Loads and upload the image
   * @param
   */
  onImgChange (event: any): boolean {
    try {
      if (!event.target.files[0]) {
        return false
      }
      const uploadedFile = event.target.files[0]
      const reader: any = new FileReader()
      reader.addEventListener(
        enums.LOAD,
        () => {
          const newFile = new File(
            [reader.result],
            uploadedFile.name,
            uploadedFile
          )
          this.sendMediaMessage(newFile, CometChat.MESSAGE_TYPE.IMAGE)
        },
        false
      )
      reader.readAsArrayBuffer(uploadedFile)
      this.imagePicker.nativeElement.value = ''
    } catch (error) {
      logger(error)
    }
    return true
  }

  /**
   * Opens window to select and upload file
   */
  getFile () {
    try {
      this.filePicker.nativeElement.click()
    } catch (error) {
      logger(error)
    }
  }

  /**
   * Loads and upload the file
   * @param
   */
  onFileChange (event: any): boolean {
    try {
      if (!event.target.files['0']) {
        return false
      }

      const uploadedFile = event.target.files['0']
      var reader: any = new FileReader()
      reader.addEventListener(
        enums.LOAD,
        () => {
          const newFile = new File(
            [reader.result],
            uploadedFile.name,
            uploadedFile
          )

          this.sendMediaMessage(newFile, CometChat.MESSAGE_TYPE.FILE)
        },
        false
      )

      reader.readAsArrayBuffer(uploadedFile)

      this.filePicker.nativeElement.value = ''
    } catch (error) {
      logger(error)
    }
    return true
  }

  /**
   * Send Text Message
   * @param
   */
  sendTextMessage (textMsg: String = ''): boolean {
    try {
      //If user you are chatting with is blocked then return false
      if (this.userBlocked) {
        return false
      }

      // Close Emoji Viewer if it is open while sending the message
      if (this.emojiToggled) {
        this.emojiToggled = false
      }

      // Dont Send Blank text messages -- i.e --- messages that only contain spaces
      if (this.messageInput.trim().length == 0 && textMsg.trim().length == 0) {
        return false
      }

      // wait for the previous message to be sent before sending the current message
      if (this.messageSending) {
        return false
      }

      this.messageSending = true

      let { receiverId, receiverType } = this.getReceiverDetails()

      let messageInput

      if (textMsg !== null) {
        messageInput = textMsg.trim()
      } else {
        messageInput = this.messageInput.trim()
      }

      let textMessage: any = new CometChat.TextMessage(
        receiverId,
        messageInput,
        receiverType
      )

      textMessage.setSender(this.cometChatUser)
      textMessage.setReceiver(this.messageType)
      textMessage._composedAt = this.getUnixTimestamp()
      textMessage._id = this.randomID()


      //clearing Message Input Box
      this.messageInput = ''

      this.messageSending = false
      // End Typing Indicator Function
      this.endTyping()

      CometChat.sendMessage(textMessage)
        .then(message => {
          console.log('message sent')
          // play audio after action generation
          this.playAudio()
          // this Message Emitted will Be Appended to the existing Message List
          this.appendMessage([{ ...message, _id: textMessage._id }]);
          this.messageSent([{ ...message, _id: textMessage._id }]);

          // Change the send button to reaction button
          setTimeout(() => {
            this.enableReaction = true
            this.enableSendButton = false
          }, 500)
        })
        .catch(error => {
          logger('Message sending failed with error:', error)
          this.messageSending = false
        })
    } catch (error) {
      logger(error)
    }
    return true
  }

  /**
   * Update the Message to be sent on every key press
   * @param event
   */
  changeHandler (event: any) {
    try {
      this.startTyping()
      if (event.target.value.length > 0) {
        this.messageInput = event.target.value
        this.enableSendButton = true
        this.enableReaction = false
      }
      if (event.target.value.length == 0) {
        this.enableSendButton = false
        this.enableReaction = false
        this.messageInput = ''
      }
    } catch (error) {
      logger(error)
    }
  }

  /**
   *  When user starts typing sets typing indicator
   */
  startTyping (timer = null, metadata = null): boolean {
    try {
      let typingInterval = timer || 5000

      if (this.isTyping > 0) {
        return false
      }
      let { receiverId, receiverType } = this.getReceiverDetails()
      let typingMetadata = metadata || undefined

      let typingNotification = new CometChat.TypingIndicator(
        receiverId,
        receiverType,
        typingMetadata
      )
      CometChat.startTyping(typingNotification)

      this.isTyping = setTimeout(() => {
        this.endTyping()
      }, typingInterval)
    } catch (error) {
      logger(error)
    }
    return true
  }

  /**
   * Send the message if user hits ENTER-key
   * @param Event e
   */
  sendMessageOnEnter (event: any) {
    try {
      if (event.keyCode === 13 && !event.shiftKey) {
        event.preventDefault()
        this.sendTextMessage(event.target.value)
      }
    } catch (error) {
      logger(error)
    }
  }


  //UTILS functions

  getUnixTimestamp () {
    return Math.round(+new Date() / 1000)
  }

  randomID() {
    // Math.random should be unique because of its seeding algorithm.
    // Convert it to base 36 (numbers + letters), and grab the first 9 characters
    // after the decimal.
    return '_' + Math.random().toString(36).substr(2, 9)
  }

  /**
   * Plays Audio When Message is Sent
   */
  playAudio() {
    try {
      let audio = new Audio();
      audio.src = INCOMING_MESSAGE_SOUND;
      audio.play();
    } catch (error) {
      logger(error);
    }
  }


}


