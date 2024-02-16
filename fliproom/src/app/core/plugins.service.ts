import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { BarcodeScannerService } from './barcode-scanner.service';
import { HttpClient } from '@angular/common/http';
import { UtilService } from './util.service';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { jsPDF } from "jspdf";

@Injectable({
  providedIn: 'root'
})
export class PluginsService {
  
  constructor(
    private _utils: UtilService,
    public scanner: BarcodeScannerService,
    private http: HttpClient,
  ) { }

  public async printPDF(base64: string = null, 
    filename=`file_${new Date().getTime()}.pdf`, 
    format="a4", 
  ) {
    /**
     * Two modes:
     * - pass fileUrl
     * - pass a base64 
     * 
     * Limitations:
     * - currently on mobile we can show only base64 png 
     */
    
    const data = {
      base64: base64
    }

    if (base64.includes("data:image/png") || base64.includes("data:image/jpg")) {
      data['type'] = 'image/png'
    } else if (base64.includes("data:application/pdf")) {
      data['type'] = 'application/pdf'
    }

    if (environment.isCordovaAvailable) {
      //convert image into pdf
      if (data['type'] == "image/png") {
        const pdf = new jsPDF("portrait", "mm", format);
        pdf.addImage(data['base64'], 'PNG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
        const pdfBase64 = pdf.output('datauri');
        data['base64'] = `${pdfBase64}`
      }

      // strip base64 with metadata
      data['base64'] = data['base64'].slice(data['base64'].indexOf('base64,') + 7)
      //save file locally
      const resp = await Filesystem.writeFile({
        path: filename,
        data: data['base64'],
        directory: Directory.External,
      });

      const shareResp = await Share.share({
        url: `${resp.uri}`,
      });
      console.log("shareResp", shareResp)
    } else {
      console.log(data)
      if (data['type'] == "application/pdf") {
        //convert to blob
        const blob = this._utils.convertBase64ToBlob(data['base64'])
        const fileURL = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = fileURL;
        link.download = filename;
        link.click();
        return
      }

      // plugin(cordova) not available - Create a fake iframe and make it hidden
      const iframe = document.createElement('iframe');
      iframe.style.height = '0';
      iframe.style.visibility = 'hidden';
      iframe.style.width = '0';

      // Set the iframe's source
      iframe.setAttribute('srcdoc', '<html><body></body></html>');
      document.body.appendChild(iframe);

      // remove iframe once closed print window
      iframe.contentWindow.addEventListener('afterprint', function () {
          iframe.parentNode.removeChild(iframe);
      });

      // set loaded image to iframe
      iframe.addEventListener('load', function () {
        const body = iframe.contentDocument.body;
        body.style.textAlign = 'center';
        document.title = filename
        const image = document.createElement('img');
        image.src = data['base64'];
        body.appendChild(image);

        iframe.contentWindow.print();
      })
    }
  }
}
