import { Account } from 'src/app/core/user.service';
import {InventoryRecord} from "./InventoryRecord";

export class Product implements Object{
  ID: number
  accountID: number
  account: Account
  code: string
  foreignID: string
  lacedID: number // NEW
  title: string
  eanCode: string
  description: string
  pieces: number
  volume: number
  weight: number
  variant: string
  variants: ProductVariant[]
  category: ProductCategory
  isGeneric: boolean
  matches: any[]
  imageReference: string
  images: ProductImage[]
  public: boolean
  sourceProductID: number
  sourceProduct: Product
  stockxId: string
  status: string
  salesLast72Hours: number
  salesLast72HoursChangePercentage: number
  lastSaleChangePercentage: number
  lastSalePrice: number
  volatilityScore: number
  volatilityScoreChangePercentage: number
  lacedTitle: string

  matchedProducts: Product[] // used for storing externally matched products


  constructor(data: any) {
    if (data == null) return null;
    data.price = Number(data.price)
    data.account = new Account(data.account)
    data.category = new ProductCategory(data.category)
    data.sourceProduct = data.sourceProduct ? new Product(data.sourceProduct) : null
    data.variants =data.variants ? data.variants.map(variant => new ProductVariant(variant)) : null
    data.images = data.images ? data.images.map(image => new ProductImage(image)) : null
    return Object.assign(this, data);
  }

  /**
   * Refresh Variant Matches
   *
   * - takes a product with its matched variants and updates the matched variants for product variant
   */
  refreshVariantMatches(){
    this.variants.forEach(variant => {
      this.matches.map(match => {
        if(match.productVariantID == variant.ID){
          const variantMatch = match.externalVariant
          variantMatch.product = match.externalProduct
          //add variantMatch if it doesn't already exist
          variant.matchedVariants.find(_variantMatch => _variantMatch.ID == variantMatch.ID) ? null : variant.matchedVariants.push(new ProductVariant(variantMatch))
        }
      })
    })
  }
}

export class ProductCategory {

  ID: number;
  accountID: number
  name: string;

  constructor(data: any) {
    if (data == null) return
    return Object.assign(this, data);
  }
}

export class ProductVariant {
  ID: number;
  productID: number
  product: Product
  foreignID: number
  lacedID: number // NEW
  name: string;
  price: number
  stockxId: string
  marketPrice: number
  sourceProductID: number
  sourceProductVariant: ProductVariant
  sourceProductVariantID :number
  inventory: InventoryRecord[]
  //size charts
  usSize: string
  ukSize: string
  jpSize: string
  euSize: string
  usmSize: string
  uswSize: string
  //extra
  gtin: string
  position: number
  matchedVariants: ProductVariant[]  = []// used for storing externally matched variants
  lacedName: string

  //checks if the sizechartsconfigs of account are available of on product variant
  canGenerateNameFromCharts(account: Account) {
    // sizecharts: 'uk', 'us', 'eu', 'jp'
    const sizesAvailable = []
    account.sizeChartConfig.map(chart=> {
      switch (chart) {
        case 'uk':
          this.ukSize ? sizesAvailable.push('uk') : null
          break;
        case 'us':
          this.usSize ? sizesAvailable.push('us') : null
          break;
        case 'eu':
          this.euSize ? sizesAvailable.push('eu') : null
          break;
        case 'jp':
          this.jpSize ? sizesAvailable.push('jp') : null
          break;
        default:
          break;
      }
    })
    if(account.sizeChartConfig.length == sizesAvailable.length){
      return true
    }


    return false
  }

  generateVariantNameFromCharts(account: Account) {
    let chartNames  = []
    account.sizeChartConfig.map(chart=> {
      switch (chart) {
        case 'uk':
          this.ukSize ? chartNames.push(this.ukSize.toUpperCase()) : null
          break;
        case 'us':
          this.usSize? chartNames.push(this.usSize.toUpperCase()) : null
          break;
        case 'eu':
          this.euSize ? chartNames.push(this.euSize.toUpperCase()) : null
          break;
        case 'jp':
          this.jpSize ? chartNames.push(this.jpSize.toUpperCase()) : null
          break;
        default:
          break;
      }
    })

    //parse variant name
    return chartNames.join(' - ')

  }


  constructor(data: any) {
    if (data == null) return
    data.product = new Product(data.product)
    data.sourceProductVariant = data.sourceProductVariant ?   new ProductVariant(data.sourceProductVariant) : null
    data.inventory = data.inventory ? data.inventory.map(invRecord => new InventoryRecord(invRecord)) : null
    return Object.assign(this, data);
  }
}

export class ProductImage{
  ID: number;
  createdAt: Date
  foreignID: string
  position: number;
  productID: number
  src: string

  constructor(data: any) {
    if (data == null) return
    return Object.assign(this, data);
  }
}

export class ProductMatchLookup{
  ID: number;
  accountID: number;
  productID: number;
  productVariantID: number;
  externalAccountID: number;
  externalProductID: number;
  externalProductVariantID: number;

  constructor(data: any) {
    if (data == null) return
    return Object.assign(this, data);
  }
}
