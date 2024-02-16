import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { environment } from 'src/environments/environment';
//import { NFC, Ndef, NdefEvent } from '@awesome-cordova-plugins/nfc/ngx';
import {IModalResponse, ModalService} from '../shared/modal/modal.service';
import { BarcodeScanner } from '@capacitor-community/barcode-scanner';
import {filter} from "rxjs/operators";

export interface ICapacitorBarcodeScanResponse {
  content: string
  format: string
  hasContent: boolean
}

@Injectable({
  providedIn: 'root'
})
export class BarcodeScannerService {
  private _technology = "barcode" // barcode, nfc
  public scannerMode: string = "read"; //read or write
  private _nfcListener: Observable<any> = null;
  public scannerWriteListener = new Subject() // Subjects are multicast. More than one subscriber can subscribe to the same object
  public scannerReadListener = new Subject() // Subjects are multicast. More than one subscriber can subscribe to the same object


  constructor(
    private modalCtrl: ModalService,
    //private nfc: NFC,
    //private ndef: Ndef
  ) {
  }

  closeBarcode() {
    document.querySelector('body').classList.remove('scanner-active');
    BarcodeScanner.showBackground();
    BarcodeScanner.stopScan();
  }

  async _scanBarcode() {
    // check or request permission
    const status = await BarcodeScanner.checkPermission({ force: true });

    // the user didn't granted permission
    if (!status.granted) {
      this.modalCtrl.warning("Grant Camera permissions to use the barcode scanning")
      return {
        cancelled: true,
        text: ''
      }
    }

    BarcodeScanner.hideBackground();
    document.querySelector('body').classList.add('scanner-active');
    const result = await BarcodeScanner.startScan() as ICapacitorBarcodeScanResponse
    document.querySelector('body').classList.remove('scanner-active');

    return {
      cancelled: !result.hasContent,
      text: result.content
    }
  }

  async _nfcWrite(nfcEvent, customBarcode = null) {
    /*
    if (customBarcode == null) {
      customBarcode = Math.random().toString(36).slice(10) + (new Date()).getTime().toString(16)
    }

    const response = {
      status: null,
      data: null,
      message: null
    }

    if (nfcEvent.tag.isWritable == false) {
      console.log("[ATTTENTION] Is only readable")
      response.status = "error"
      response.message = "This NFC Tag is only read-mode"

      this.scannerMode = "read"

      this.scannerWriteListener.next(response)
      return response
    }

    if (nfcEvent.tag.ndefMessage && nfcEvent.tag.ndefMessage.length > 0) {
      console.log("[ATTTENTION] Overwrite current data?")
    }

    var message = [
      this.ndef.textRecord(customBarcode)
    ];

    try {
      const success = await this.nfc.write(message)
      response.status = "ok"
      response.data = customBarcode
    } catch (err) {
      if (err == "cordova_not_available") { // debug mode
        response.status = "ok"
        response.data = customBarcode
      } else {
        response.status = "error"
        response.message = err
      }
    }

    // After write - return to read mode
    this.scannerMode = "read"

    this.scannerWriteListener.next(response)
    return response
    */
  }

  async _nfcRead(nfcEvent) {
    const response: ScannerResponse = {
      status: null,
      data: null,
      message: null
    }

    if (nfcEvent.tag.ndefMessage == undefined) {
      response.message = "Empty NFC Tag"
      response.status = "error"
      this.scannerReadListener.next(response)
      return response
    }

    const barcode = String.fromCharCode(...nfcEvent.tag.ndefMessage[0].payload.slice(3))
    response.data = barcode
    response.status = "ok"
    this.scannerReadListener.next(response)
    return response
  }

  async setReadMode() {
    /**
     * Wrapper method to handle different devices interfaces with NFC technology
     *
     * Android Devices - setReadMode sets the nfc mode. The user then scans the nfc tag triggering the event listener that will operate in read mode
     * IOS Devices - setReadMode sets the nfc mode AND prompts the nfc reading on the mobile phone screen waiting for the user to scan the nfc tag
     */
    this.scannerMode = "read"

    if (this._technology == "barcode") {
      const response: ScannerResponse = {
        status: null,
        data: null,
        message: null
      }

      if (environment.isCordovaAvailable) {
        const _response = await this._scanBarcode()
        if (_response.cancelled) {
          return
        }

        response.status = "ok"
        response.data = _response.text

        this.scannerReadListener.next(response)
      }

    }

    // for debug
    if (!environment.isCordovaAvailable) {
      const response: ScannerResponse = {
        status: null,
        data: null,
        message: null
      }
      this.modalCtrl.input({title: "Barcode", type: "string"}).pipe(filter((resp) => resp)).subscribe(resp => {
        response.status = "ok"
        response.data = `${resp}`.toLowerCase() // handle human input in uppercase
        this.scannerReadListener.next(response)
      })
    }
  }

  async setWriteMode() {
    /**
     * Wrapper method to handle different devices interfaces with NFC technology
     *
     * Android Devices - setWriteMode sets the nfc mode. The user then scans the nfc tag triggering the event listener that will operate in write mode
     * IOS Devices - setWriteMode sets the nfc mode AND prompts the nfc reading on the mobile phone screen waiting for the user to scan the nfc tag
     */
    this.scannerMode = "write"

    if (this._technology == "barcode") {
      if (environment.platform != "web") {
        const response: ScannerResponse = {
          status: null,
          data: null,
          message: null
        }

        const _response = await this._scanBarcode()
        if (_response.cancelled) {
          return
        }

        response.status = "ok"
        response.data = _response.text

        this.scannerMode = "read"

        this.scannerWriteListener.next(response)
      }
    }

    // for debug
    if (environment.platform == "web") {
      const response: ScannerResponse = {
        status: null,
        data: null,
        message: null
      }

      this.modalCtrl.input({title: "Barcode", type: "string"}).pipe(filter((resp) => resp)).subscribe(resp => {
        response.status = "ok"
        response.data = `${resp}`.toLowerCase() // handle human input in uppercase
        this.scannerMode = "read"
        this.scannerReadListener.next(response)
      })
    }
  }
}

export interface ScannerResponse {
  status: string
  data: any
  message: string
}
