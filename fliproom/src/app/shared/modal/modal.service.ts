import { Component, Injectable } from '@angular/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarConfig } from '@angular/material/snack-bar';
import { ActionSheetController, AnimationController, ModalController, ToastController } from '@ionic/angular';
import { Observable, Subject, from, of } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { AlertComponent } from './alert/alert.component';
import {ConfirmComponent, IConfirmComponent} from './confirm/confirm.component';
import { HelpPanelComponent } from './help-panel/help-panel.component';
import { IInputComponent, InputComponent } from './input/input.component';
import { IProgressComponent, ProgressComponent } from './progress/progress.component';
import { FeedbackInterfaceComponent, IFeedbackInterfaceComponent } from './feedback-interface/feedback-interface.component';
import {ActionAnimationComponent} from "./action-animation/action-animation.component";
import { IClipboardComponent, ClipboardComponent } from './clipboard/clipboard.component';

export interface IActionsSheetAction {
  icon?: string
  title: string
  description?: string
  disabled?: boolean
  key: string
}

export interface IModalResponse {
  data: any;
  role: string | undefined;
}

@Injectable()

export class ModalService {
  private _modalOpen: any = null
  public onClose: any = new Subject()

  constructor(
    private _toastController: ToastController,
    public dialog: MatDialog,
    private animationCtrl: AnimationController,
    private modalController: ModalController,
    public actionSheetController: ActionSheetController
  ) { }

  open(modalComponent: any, data: { [key: string]: any;} = {}, configs: any = {}): Observable<any> {
    return from(this.openModal(modalComponent, data, configs)).pipe(
      filter((resp: IModalResponse) => resp.role == 'submit' && resp.data !== undefined),
      map((resp: IModalResponse) => resp.data)
    )
  }

  async openModal(modalComponent: any, data: { [key: string]: any;} = {}, configs: any = {}): Promise<any> {
    const modalLeaveAnimation = (baseEl: any) => {
      return this.animationCtrl.create('fadeOut')
        .addElement(baseEl)
        .duration(200)
        .easing('ease-in-out')
        .fromTo('opacity', '1', '0');
    }

    this._modalOpen = await this.modalController.create({
      component: modalComponent,
      componentProps: {data: data},
      cssClass: configs.cssClass,
      backdropDismiss: true,
      swipeToClose:true,
      leaveAnimation: modalLeaveAnimation
    })

    this._modalOpen.present()
    const dismiss = await this._modalOpen.onDidDismiss()
    this.onClose.next()
    if(dismiss.role == 'backdrop'){
      dismiss.role = 'submit'
      dismiss.data = undefined
    }
    // Case when user press cancel
    if (dismiss.role == undefined) {
      dismiss.role = 'submit'
      dismiss.data = undefined
    }
    return dismiss
  }

  actionSheet(header, actions: IActionsSheetAction[]): Observable<IModalResponse> {
    return from(this._actionSheet(header, actions))
  }

  async _actionSheet(header: string, actions: IActionsSheetAction[]) {
    const _actions = []
    actions.map((action: IActionsSheetAction) => _actions.push({
      text: action.title,
      id: action.key,
      cssClass: action.disabled ? ['disabled'] : [],
      //icon: action.icon,
      data: {
        key: action.key,
        disabled: action.disabled,
        disabledMessage: action.description
      }
    }))


    const actionSheet = await this.actionSheetController.create({
      header: header,
      cssClass: 'my-custom-class',
      buttons: _actions
    });

    await actionSheet.present();
    const {data, role} = await actionSheet.onDidDismiss()

    if (data === undefined) {
      return {data: null, role: null}
    } else if (data.disabled) {
      this.warning(data.disabledMessage)
      return {data: null, role: null}
    } else {
      return {data: data.key, role: 'submit'}
    }
  }

  error(message: string, actionName: string = 'Got It!') {
    this._openSnackbar(message, 'error', actionName)
  }

  info(message: string, actionName: string = 'Got It!'): Observable<any> {
    return this._openSnackbar(message, 'info', actionName)
  }

  warning(message: string, actionName: string = 'Got It!') {
    this._openSnackbar(message, 'warning', actionName)
  }

  success(message: string, actionName: string = 'Got It!') {
    this._openSnackbar(message, 'success', actionName)
  }

  confirm(message: string, extraOptions: any = {}): Observable<any> {
    let data: IConfirmComponent = {
      message: message,
    }
    //add extra options
    data = {...data, ...extraOptions}
    return this.open(ConfirmComponent, data, {cssClass: 'custom'})
  }

  alert(message: string) {
    return this.open(AlertComponent, {'message': message}, {cssClass: 'custom'})
  }

  help(serviceName: string) {
    return this.open(HelpPanelComponent, {'serviceName': serviceName}, {cssClass: 'custom'})
  }

  actionCompleted() {
    return this.open(ActionAnimationComponent, {}, {cssClass: 'fit-content'})
  }

  input(data: IInputComponent, configs: any = {}): Observable<any> {
    return this.open(InputComponent, data, {cssClass: (configs.cssClass ?? '') + ' custom'})
  }

  rate(data: IFeedbackInterfaceComponent) {
    let cssClass = 'custom'
    if (data.cssClass) {cssClass = data.cssClass}
    data.ionContentAlt = true
    return this.open(FeedbackInterfaceComponent, data, {cssClass: cssClass})
  }

 /**
  * Progress Component
  * @param title Title text
  * @param subtitle Subtitle text just above progress bar
  * @param status loading, complete, error
  * @param confirm Confirm button text if present
  * @param cancel Cancel button text if present
  */

  progress(data: IProgressComponent): Observable<any> {
    return this.open(ProgressComponent, data, { cssClass: 'custom' })
  }

  clipboard(data: IClipboardComponent, configs: any = {}): Observable<any> {
    return this.open(ClipboardComponent, data, {cssClass: (configs.cssClass ?? '') + ' custom'})
  }

  private _openSnackbar(message: string, className: string, actionName: string = 'Got It!'): Observable<any> {
    const obs = new Subject<any>()

    this._toastController.create({
      message: message,
      duration: 3000,
      position: 'top',
      cssClass: className,
      buttons: [{
        text: actionName,
        role: 'cancel',
        handler: () => {
          obs.next(actionName)
        }
      }]
    }).then((toast) => {
      toast.present();
      toast.onDidDismiss().then(() => obs.next('dismissed'))
    })

    return obs
  }

  close() {
    this._modalOpen.dismiss();
  }
}
