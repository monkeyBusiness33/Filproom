const models = require('./schemas')


exports.parameters = {
    newOrderIn: {
        type: "object",
        properties: {
            companyBranchID:          { type: "number", example: 1},
            clientID:                 { type: "number", example: 1},
            clientBranchID:           { type: "number", example: 1},
            manufacturer:             { type: "string", example: "new manufacturer"},
            typeID:                   { type: "number", enum: [2]},
            documentDate:             { type: "string", nullable: true, example: "2021-07-31T13:38:25.845Z"},
            arrivalDate:              { type: "string", nullable: true, example: "2021-07-31T13:38:25.845Z"},
            documentRef:              { type: "string", nullable: true, example: "Reference"},
            manufacturerRef:          { type: "string", nullable: true, example: "Reference"},
            clientRef:                { type: "string", nullable: true, example: "Reference"},
            documentBase64:           { type: "string", nullable: true, description: "Order Document file in base64", example: "JVBERi0xLjQKM.."},
            generateBarcodes:         { type: "boolean", nullable: true, description: "If True. Generates a barcode for each item in the order", example: true},
            barcodePrimaryReference:  { type: "string", nullable: true, enum: ['null', 'clientRef', 'manufactueerRef', 'documnetRef'], description: "required if generateBarcodes:true - specify the barcode main reference to display"},
            details: {
                type: "array",
                description: "One line per product. Item Properties (barcode, weight, volume, pieces), if specified, overwrite the product properties (eanCode, weight, volume, pieces)",
                items: {
                    minItems: 1,
                    type: "object",
                    properties: {
                        item: {
                            properties: {
                                barcode:          { type: "string", nullable: true},
                                containerBarcode: { type: "string", nullable: true},
                                weight:           { type: "number", nullable: true},
                                volume:           { type: "number", nullable: true},
                                pieces:           { type: "number", nullable: true},
                                quantity:         { type: "number", example: 10},
                                genericProduct:   { type: "boolean", description: "if true, products is nullable - weight & volume are required and must be split per item"},
                                product: {
                                    properties: {
                                        code:        { type: "string"},
                                        description: { type: "string"},
                                        eanCode:     { type: "string", nullable: true},
                                        category:    { type: "string", nullable: true},
                                        variant: { type: "string", nullable: true},
                                        pieces: { type: "number",  nullable: true, minimum: 1},
                                        weight: { type: "number", minimum: 0.001},
                                        volume: { type: "number", minimum: 0.001}
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    },
    

    /**
     * ORDERS OUT
     */
    newOrderOut: {
        type: "object",
        properties: {
            companyBranchID: { type: "number"},
            requestedDeliveryDate: { type: "string"},
            externalRef: { type: "string"},
            notes: { type: "string"},
            items: {
                type: "array",
                items: {
                    minItems: 1,
                    type: "integer",
                }
            },
            consignee : JSON.parse(JSON.stringify(models.consignee)),
            courier : JSON.parse(JSON.stringify(models.courier))
        }

    },

    /**
     * New delivery run
     */
    newDeliveryRun: {
        type: "object",
        properties: {
            companyBranchID: { type: "number"},
            foreignID: { type: "string"},
            driverID: { type: "number"},
            scheduledDate: { type: "string"},
            notes: { type: "string"},
            deliveries: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        ID: { type: "number"},
                        runCheckpointNumber: { type: "number"}
                    }
                }
            }
        }
    },
    /**
     * Updated delivery run
     */
    updatedDeliveryRun: {
        type: "object",
        properties: {
            foreignID: { type: "string"},
            driverID: { type: "number"},
            scheduledDate: { type: "string"},
            notes: { type: "string"},
            deliveries: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        ID: { type: "number"},
                        runCheckpointNumber: { type: "number"}
                    }
                }
            }
        }
    },
    /**
     * New delivery
     */
    newDelivery: {
        type: "object",
        properties: {
            companyBranchID: {type: "number"},
            orderOutID: {type: "number"},
            foreignID: {type: "string"},
            date: {type: "string"},
            notes: {type: "string"},
            documentBase64: {type: "string"}
        }
    },
    /**
     * Updated delivery
     */
    updatedDelivery: {
        type: "object",
        properties: {
            foreignID: {type: "string"},
            date: {type: "string"},
            notes: {type: "string"},
            documentBase64: {type: "string"}
        }
    }
}

/**
 * MODEL CONSTRUCTION
 */

// order in with items
const orderInDetails = JSON.parse(JSON.stringify(models.orderIn))
orderInDetails.properties.clientBranch =JSON.parse(JSON.stringify(models.clientBranch))
orderInDetails.properties.type =JSON.parse(JSON.stringify(models.orderInType))
orderInDetails.properties.status =JSON.parse(JSON.stringify(models.status))
orderInDetails.properties.items =JSON.parse(JSON.stringify(models.items))
orderInDetails.properties.items.items.properties.location =JSON.parse(JSON.stringify(models.location))
orderInDetails.properties.items.items.properties.product = JSON.parse(JSON.stringify(models.product))
orderInDetails.properties.items.items.properties.anomaly = JSON.parse(JSON.stringify(models.anomaly))
orderInDetails.properties.items.items.properties.anomaly.properties.status = JSON.parse(JSON.stringify(models.status))
orderInDetails.properties.items.items.properties.anomaly.properties.type = JSON.parse(JSON.stringify(models.type))

//orders in
const ordersIn = JSON.parse(JSON.stringify(models.ordersIn))
ordersIn.items.properties.clientBranch = JSON.parse(JSON.stringify(models.clientBranch))
ordersIn.items.properties.type =JSON.parse(JSON.stringify(models.orderInType))
ordersIn.items.properties.status =JSON.parse(JSON.stringify(models.status))
ordersIn.items.properties.items = JSON.parse(JSON.stringify(models.items))


//Order in details
const newItems = JSON.parse(JSON.stringify(models.items))

//order out with items
const orderOutDetails = JSON.parse(JSON.stringify(models.orderOut))
orderOutDetails.properties.clientBranch =JSON.parse(JSON.stringify(models.clientBranch))
orderOutDetails.properties.clientBranch.properties.client =JSON.parse(JSON.stringify(models.client))
orderOutDetails.properties.consignee =JSON.parse(JSON.stringify(models.consignee))
orderOutDetails.properties.user =JSON.parse(JSON.stringify(models.user))
orderOutDetails.properties.courier =JSON.parse(JSON.stringify(models.courier))
orderOutDetails.properties.delivery =JSON.parse(JSON.stringify(models.delivery))
orderOutDetails.properties.items =JSON.parse(JSON.stringify(models.items))
orderOutDetails.properties.items.items.properties.location =JSON.parse(JSON.stringify(models.location))
orderOutDetails.properties.items.items.properties.product = JSON.parse(JSON.stringify(models.product))
orderOutDetails.properties.items.items.properties.anomaly = JSON.parse(JSON.stringify(models.anomaly))
orderOutDetails.properties.items.items.properties.anomaly.properties.status = JSON.parse(JSON.stringify(models.status))
orderOutDetails.properties.items.items.properties.anomaly.properties.type = JSON.parse(JSON.stringify(models.type))
orderOutDetails.properties.items.items.properties.orderIn = JSON.parse(JSON.stringify(models.orderIn))
orderOutDetails.properties.status =JSON.parse(JSON.stringify(models.status))

//orders out
const ordersOut = JSON.parse(JSON.stringify(models.ordersOut))
ordersOut.items.properties.clientBranch = JSON.parse(JSON.stringify(models.clientBranch))
ordersOut.items.properties.consignee =JSON.parse(JSON.stringify(models.consignee))
ordersOut.items.properties.user =JSON.parse(JSON.stringify(models.user))
ordersOut.items.properties.courier =JSON.parse(JSON.stringify(models.courier))
ordersOut.items.properties.delivery =JSON.parse(JSON.stringify(models.delivery))
ordersOut.items.properties.status =JSON.parse(JSON.stringify(models.status))
ordersOut.items.properties.items = JSON.parse(JSON.stringify(models.items))

const delivery = JSON.parse(JSON.stringify(models.delivery))
delivery.properties.orderOut = JSON.parse(JSON.stringify(models.orderOut))
delivery.properties.orderOut.properties.clientBranch = JSON.parse(JSON.stringify(models.clientBranch))
delivery.properties.orderOut.properties.consignee = JSON.parse(JSON.stringify(models.consignee))
delivery.properties.orderOut.properties.user = JSON.parse(JSON.stringify(models.user))
delivery.properties.orderOut.properties.items =JSON.parse(JSON.stringify(models.items))
delivery.properties.orderOut.properties.items.items.properties.product =JSON.parse(JSON.stringify(models.product))
delivery.properties.orderOut.properties.items.items.properties.orderIn =JSON.parse(JSON.stringify(models.orderIn))
delivery.properties.anomaly = JSON.parse(JSON.stringify(models.anomaly))

const deliveries = JSON.parse(JSON.stringify(models.deliveries))
deliveries.items.properties.orderOut = JSON.parse(JSON.stringify(models.orderOut))
deliveries.items.properties.orderOut.properties.consignee = JSON.parse(JSON.stringify(models.consignee))
deliveries.items.properties.orderOut.properties.items =JSON.parse(JSON.stringify(models.items))



exports.responses = {
    orderInDetails : orderInDetails,
    ordersIn : ordersIn,
    newItems : newItems,
    orderOutDetails: orderOutDetails,
    ordersOut : ordersOut,
    delivery: delivery,
    deliveries: deliveries

}
