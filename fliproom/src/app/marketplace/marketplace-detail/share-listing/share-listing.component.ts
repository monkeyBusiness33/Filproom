import { Component, Inject, Input, OnInit } from '@angular/core'
import { MAT_DIALOG_DATA } from '@angular/material/dialog'
import { ModalController } from '@ionic/angular'
import { ModalService } from 'src/app/shared/modal/modal.service'
import { MarketplaceListing } from 'src/app/shared/models/MarketplaceList'
import { environment } from 'src/environments/environment'
@Component({
  selector: 'share-listing',
  templateUrl: './share-listing.component.html',
  styleUrls: ['./share-listing.component.scss']
})
export class ShareListingComponent implements OnInit {
  @Input('data') data: MarketplaceListing

  public shareText: string
  public list: MarketplaceListing
  public url: string
  public environment = environment

  constructor (
    private _modalCtrl: ModalController,
    private _modalService: ModalService,
  ) {}

  ngOnInit (): void {
    this.list = this.data
    this.url = `${environment.apiUrl}marketplace/listing/${this.list.ID}`
  }

  onCancel () {
    this._modalCtrl.dismiss()
  }

  createText () {
    let message = ''
    message += this.list.type.toUpperCase() + '\n'
    message += this.list.product.title.toUpperCase() + '\n'
    message += `${this.list.variant.name}\nQuantity: ${this.list.quantityRequested}\nPrice: $${this.list.price}\n`
    return message
  }

  createTextForCopy () {
    let message = ''
    message += this.list.type.toUpperCase() + '\n'
    message += this.list.product.title.toUpperCase() + '\n'
    message += `${this.list.variant.name}\nQuantity: ${this.list.quantityRequested}\nPrice: $${this.list.price}\n\n`
    message += this.url

    return message
  }

  copyToClipboard() {
    const textarea = document.getElementById('message-textbox') as HTMLInputElement
    textarea.select()
    textarea.setSelectionRange(0, 99999);
    document.execCommand('copy')
    this._modalService.info('Copied to Clipboard')
  }
}
