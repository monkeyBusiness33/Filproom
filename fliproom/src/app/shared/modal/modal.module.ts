import {CUSTOM_ELEMENTS_SCHEMA, NgModule} from '@angular/core';
import { CommonModule } from '@angular/common';
import {MatDialogModule, MatDialogRef, MAT_DIALOG_DATA} from '@angular/material/dialog';
import { ModalService } from './modal.service';
import {MatSnackBarModule} from '@angular/material/snack-bar';
import { ConfirmComponent } from './confirm/confirm.component';
import { AlertComponent } from './alert/alert.component';
import { TermsAndConditionsComponent } from './terms-and-conditions/terms-and-conditions.component';
import { InputComponent } from './input/input.component';
import { MaterialModule } from 'src/app/material.module';
import { HelpPanelComponent } from './help-panel/help-panel.component';
import { IonicModule } from '@ionic/angular';
import { FeedbackInterfaceComponent } from './feedback-interface/feedback-interface.component';
import {ActionAnimationComponent} from "./action-animation/action-animation.component";
import { ClipboardComponent } from "./clipboard/clipboard.component";

@NgModule({
  declarations: [ConfirmComponent, AlertComponent, TermsAndConditionsComponent, InputComponent, HelpPanelComponent, FeedbackInterfaceComponent, ActionAnimationComponent, ClipboardComponent],
  imports: [
    CommonModule,
    MatDialogModule,
    MatSnackBarModule,
    MaterialModule,
    IonicModule
  ],
  providers: [
    ModalService,
    { provide: MAT_DIALOG_DATA, useValue: {} },
    { provide: MatDialogRef,    useValue: {} },
  ],
  exports: [

  ],
  schemas: [ CUSTOM_ELEMENTS_SCHEMA ]


})
export class ModalModule { }
