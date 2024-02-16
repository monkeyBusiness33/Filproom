const activeLacedListings = [
    {
        "imageUrl": "https://laced.imgix.net/products/BQ2718-400/01.jpg?w=196",
        "title": {
            "label": "Undercover x Nike React Element 87 Lakeside",
            "href": "/products/undercover-x-nike-react-element-87-lakeside"
        },
        "info": "1 x UK 0.5c | EU 16 | US 1c",
        "subInfo": "BQ2718-400",
        "hasStatus": false,
        "isBuyer": false,
        "status": null,
        "statusOverride": null,
        "statusMessage": null,
        "statusType": null,
        "price": "£8,000",
        "priceAction": null,
        "actions": [
            {
                "label": "Edit",
                "href": "/account/selling/1433254/edit"
            },
            {
                "label": "",
                "href": "/account/selling/1433254",
                "id": 1433254,
                "options": {
                    "delete_icon": true,
                    "data": {
                        "confirm": "Are you sure you'd like to delete this listing?",
                        "method": "delete"
                    }
                }
            }
        ],
        "showLowestPriceStatus": null,
        "lowestAlternativePrice": null,
        "invalidSize": false
    },
    {
        "imageUrl": "https://laced.imgix.net/products/0eea2a91-085b-4c7f-b53f-1c38b95a96e3.jpg?w=196",
        "title": {
            "label": "Nike Air Max 95 Have A Nike Day Black",
            "href": "/products/nike-air-max-95-have-a-nike-day-black"
        },
        "info": "2 x UK 2 | EU 34 | US 2.5",
        "subInfo": "BQ9131-001",
        "hasStatus": false,
        "isBuyer": false,
        "status": null,
        "statusOverride": null,
        "statusMessage": null,
        "statusType": null,
        "price": "£9,000",
        "priceAction": null,
        "actions": [
            {
                "label": "Edit",
                "href": "/account/selling/1432627/edit"
            },
            {
                "label": "",
                "href": "/account/selling/1432627",
                "id": 1432627,
                "options": {
                    "delete_icon": true,
                    "data": {
                        "confirm": "Are you sure you'd like to delete this listing?",
                        "method": "delete"
                    }
                }
            }
        ],
        "showLowestPriceStatus": null,
        "lowestAlternativePrice": null,
        "invalidSize": false
    }
];

const pendingLacedListings = [
    {
        "imageUrl": "https://laced.imgix.net/products/d15fa8fb-f710-4234-bd4f-aea1480cb487.jpg?w=196",
        "title": {
            "label": "Yeezy Slide Slate Marine",
            "href": "/products/yeezy-slide-slate-marina"
        },
        "info": "UK 4 | EU 37 | US 4",
        "subInfo": "ID2349",
        "hasStatus": true,
        "isBuyer": false,
        "status": "pending_shipment",
        "statusOverride": null,
        "statusMessage": "Pending",
        "statusType": "orange",
        "price": "£20",
        "priceAction": null,
        "actions": [
            {
                "label": "View",
                "href": "/account/selling/MP00O2Z6"
            },
            {
                "label": "Re-Print Postage",
                "href": "/account/selling/MP00O2Z6/shipping-label",
                "options": {
                    "disabled": false
                }
            },
            {
                "label": "View Postage",
                "href": "/account/selling/MP00O2Z6/shipping-label.pdf",
                "options": {
                    "target": "_blank",
                    "disabled": false
                }
            }
        ],
        "showLowestPriceStatus": null,
        "lowestAlternativePrice": null,
        "invalidSize": null
    }
];

const completedLacedListings = [
    {
        "imageUrl": "https://laced.imgix.net/products/69bdd07b-8769-4c71-b8c7-9248237aa8ff.jpg?w=196",
        "title": {
            "label": "Air Jordan 1 Mid Black Gym Red",
            "href": "/products/air-jordan-1-mid-black-gym-red"
        },
        "info": "UK 11 | EU 46 | US 12",
        "subInfo": "554724-122",
        "hasStatus": true,
        "isBuyer": false,
        "status": "verified",
        "statusOverride": null,
        "statusMessage": "Shipped to buyer",
        "statusType": "green",
        "price": "£165",
        "priceAction": null,
        "actions": [
            {
                "label": "View",
                "href": "/account/selling/60XJ8LOV"
            }
        ],
        "showLowestPriceStatus": null,
        "lowestAlternativePrice": null,
        "invalidSize": null
    }
];

const cypressTestInternalLacedInventoryListings = [{
    "ID": 12,
    "accountID": 4,
    "saleChannelID": 4,
    "inventoryID": 3,
    "productID": 105,
    "productVariantID": 1105,
    "status": "active",
    "payout": "999.00",
    "priceSourceName": null,
    "priceSourceMargin": null,
    "price": "1183.52",
    "isActiveListing": false,
    "lacedID": null,
    "createdAt": "2024-01-04T02:36:27.000Z",
    "updatedAt": "2024-01-04T02:36:27.000Z",
    "inventory": {
      "ID": 3,
      "accountID": 4,
      "productID": 105,
      "productVariantID": 1105,
      "virtual": false,
      "cost": "100.00",
      "quantity": 1,
      "quantityAtHand": 0,
      "quantityIncoming": 1,
      "notes": "some notes",
      "warehouseID": 924,
      "createdAt": "2024-01-04T02:36:27.000Z",
      "updatedAt": "2024-01-04T02:36:27.000Z",
      "warehouse": {
        "ID": 924,
        "foreignID": null,
        "accountID": 4,
        "addressID": 4,
        "name": "Storage #2",
        "fulfillmentCentre": true,
        "createdAt": "2024-01-04T02:23:40.000Z",
        "updatedAt": "2024-01-04T02:23:40.000Z"
      },
      "items": [
        {
          "ID": 3,
          "accountID": 4,
          "productID": 105,
          "productVariantID": 1105,
          "orderID": null,
          "inventoryID": 3,
          "barcode": null,
          "warehouseID": null,
          "volume": "0.001",
          "weight": "0.001",
          "deletedAt": null,
          "statusID": 7,
          "createdAt": "2024-01-04T02:36:27.000Z",
          "updatedAt": "2024-01-04T02:36:27.000Z"
        }
      ]
    },
    "account": {
      "ID": 4,
      "foreignID": null,
      "name": "reseller guy",
      "logo": null,
      "currency": "GBP",
      "roleID": 4,
      "vatNumber": null,
      "taxRate": null,
      "billingAddressID": null,
      "revolutJWT": null,
      "revolutRefreshToken": null,
      "stripeConnectAccountID": null,
      "stripeConnectAccountSetupCompleted": false,
      "defaultStripeDestinationID": "ba_1KZ2VAQYMyEkvfv2dfL0cykv",
      "stripeAccountID": "acct_1KZ2UQQYMyEkvfv2",
      "stripeAPIKey": null,
      "stripeOnBoardingURL": null,
      "stripeID": null,
      "stripeClientID": null,
      "tier": "bronze",
      "sizeChartConfigs": "uk,eu,us",
      "isConsignor": true,
      "createdAt": "2024-01-04T02:23:38.000Z",
      "updatedAt": "2024-01-04T02:23:43.000Z"
    },
    "saleChannel": {
      "ID": 4,
      "accountID": 4,
      "title": "laced",
      "description": "",
      "isDefault": true,
      "platform": "laced",
      "email": "a.singhania@wiredhub.io",
      "password": "LacedFliproom@98",
      "shopifyStoreName": null,
      "shopifyAPIAuth": null,
      "allowVirtualInventory": false,
      "markup": "15.00",
      "taxRate": "0.00",
      "syncProgress": 0,
      "policyUrl": null,
      "sameDayDeliveryInternalPriorityMargin": null,
      "sameDayDelivery": false,
      "createdAt": "2024-01-04T02:23:40.000Z",
      "updatedAt": "2024-01-04T02:23:40.000Z"
    },
    "product": {
      "ID": 105,
      "foreignID": "c8zuxof0d4w",
      "sourceProductID": null,
      "accountID": 4,
      "eanCode": null,
      "code": "554724-122",
      "title": "Air Jordan 1 Mid Black Gym Red",
      "description": "test description",
      "height": null,
      "width": null,
      "depth": null,
      "volume": "1.000",
      "weight": "1.000",
      "pieces": 1,
      "categoryID": 53,
      "lacedID": null,
      "lacedTitle": "Air Jordan 1 Mid Black Gym Red",
      "lacedCode": "554724-122",
      "public": false,
      "untracked": false,
      "imageReference": "https://storage.googleapis.com/production-wiredhub/companies/tramo/logo.png",
      "stockxId": null,
      "status": "active",
      "category2": null,
      "gender": null,
      "color": null,
      "retailPrice": null,
      "releaseDate": null,
      "brand": null,
      "salesLast72Hours": null,
      "salesLast72HoursChangePercentage": null,
      "lastSalePrice": null,
      "lastSaleChangePercentage": null,
      "volatilityScore": null,
      "volatilityScoreChangePercentage": null,
      "createdAt": "2024-01-04T02:36:27.000Z",
      "updatedAt": "2024-01-04T02:36:27.000Z",
      "category": {
        "ID": 53,
        "accountID": 4,
        "name": "test category",
        "createdAt": "2024-01-04T02:35:40.000Z",
        "updatedAt": "2024-01-04T02:35:40.000Z"
      },
      "sourceProduct": null
    },
    "variant": {
      "ID": 1105,
      "productID": 105,
      "foreignID": "p2p1cne1pv",
      "sourceProductVariantID": null,
      "name": "plq1lpryhh",
      "usSize": null,
      "ukSize": "UK 1",
      "jpSize": null,
      "euSize": null,
      "usmSize": null,
      "uswSize": null,
      "cost": null,
      "price": null,
      "weight": "1.000",
      "volume": "1.000",
      "position": 0,
      "stockxId": null,
      "status": "active",
      "untracked": false,
      "gtin": "2d67wyijl8c",
      "lacedID": null,
      "lacedName": "UK 11 | EU 46 | US 12",
      "createdAt": "2024-01-04T02:36:27.000Z",
      "updatedAt": "2024-01-04T02:36:27.000Z",
      "sourceProductVariant": null
    }
}];

module.exports = { activeLacedListings, pendingLacedListings, completedLacedListings, cypressTestInternalLacedInventoryListings };
