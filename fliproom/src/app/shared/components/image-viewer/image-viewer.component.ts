import {Component, Input, OnInit} from '@angular/core';
import {ModalController} from "@ionic/angular";

export interface ImageData {
  url: string
}

@Component({
  selector: 'app-image-viewer',
  templateUrl: './image-viewer.component.html',
  styleUrls: ['./image-viewer.component.scss'],
})
export class ImageViewerComponent implements OnInit {

  constructor(
    private _modalCtrl: ModalController,
  ) { }

  @Input() data: ImageData;
  public imageURl

  ngOnInit() {
    this.imageURl = this.data.url
  }

  closeModal(){
    this._modalCtrl.dismiss(null, 'submit');
  }



}
