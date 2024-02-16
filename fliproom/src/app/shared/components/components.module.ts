import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ModalModule } from '../modal/modal.module';
import { MaterialModule } from '../../material.module';
import { SelectItemComponent } from './select-item/select-item.component';
import { UsersnapWidgetComponent } from './usersnap-widget/usersnap-widget.component';
import { ChangePasswordComponent } from './change-password/change-password.component';
import { WarehouseFormComponent } from './warehouse-form/warehouse-form.component';
import { ItemDetailsComponent } from './item-details/item-details.component';
import { CKEditorModule } from '@ckeditor/ckeditor5-angular';
import {ImageViewerComponent} from "./image-viewer/image-viewer.component";
import { ProductMatchComponent } from '../product-match/product-match.component';
import {StepsComponent} from "./steps/steps.component";

const components = [
  SelectItemComponent,
  UsersnapWidgetComponent,
  WarehouseFormComponent,
  ItemDetailsComponent,
  ImageViewerComponent,
  ProductMatchComponent,
  ChangePasswordComponent,
  StepsComponent
];
@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ReactiveFormsModule,
    ModalModule,
    MaterialModule,
    CKEditorModule
  ],
  declarations: [
    ...components
  ],
  exports: [
    ...components
  ],
})
export class CommonComponentsModule {}
