/**
 * Order In
 */
exports.orderIn ={
        type: "object",
        properties: {
            ID: {type: "number"},
            manufacturerID: { type: "number"},
            companyBranchID: { type: "number"},
            clientBranchID: { type: "number"},
            typeID: {type: "number", enum: [2]},
            documentRef:  { type: "string", nullable: true},
            documentDate: { type: "string", nullable: true},
            arrivalDate:  { type: "string", nullable: true},
            attachment: { type: "string" },
            manufacturerRef: { type: "string", nullable: true},
            clientRef: { type: "string", nullable: true},
            completedAt: { type: "string", nullable: true},
            createdAt: { type: "string"},
            updatedAt: { type: "string"},
            manufacturer: {
                type: "object",
                properties: {
                    ID: { type: "number"},
                    clientID: { type: "number"},
                    name: { type: "string"},
                    createdAt: { type: "string"},
                    updatedAt: { type: "string"}
                }
            },

        }
    }
/**
 * Status
 */
exports.status = {
    type: "object",
    properties:{
        ID : { type: "number"},
        name : { type: "string"},
        createdAt : { type: "string"},
        updatedAt : { type: "string"}
    }
}

/**
 * Type
 */
exports.type = {
    type: "object",
    properties:{
        ID : { type: "number"},
        name : { type: "string"},
        createdAt : { type: "string"},
        updatedAt : { type: "string"}
    }
}

/**
 * OrderIn Type
 */
exports.orderInType = {
    type: "object",
    properties:{
        ID: { type: "number"},
        clientID: { type: "number"},
        externalReference: { type: "string"},
        name: { type: "string"},
        createdAt: { type: "string"},
        updatedAt: { type: "string"}
    }
}
/**
 * Client Branch
 */
exports.clientBranch = {
    type: "object",
    properties:{
        ID: { type: "number"},
        clientID: { type: "number"},
        externalReference: { type: "string"},
        name: { type: "string"},
        createdAt: { type: "string"},
        updatedAt: { type: "string"}
    }
}
/**
 * Client
 */
exports.client = {
    type: "object",
    properties:{
        ID: { type: "number"},
        name: { type: "string"},
        logo: { type: "string"},
        storageFolder: { type: "string"},
        createdAt: { type: "string"},
        updatedAt: { type: "string"}
    }
}
/**
 * List of Orders In
 */
exports.ordersIn = {
    type: "array",
    items: exports.orderIn
}

/**
 * Item
 */
exports.item = {
    properties: {
        ID:{ type: "number"},
        productID:{ type: "number"},
        orderInID:{ type: "number"},
        orderOutID:{ type: "number", nullable: true},
        barcode:{ type: "string", nullable: true},
        height:{ type: "number", nullable: true},
        width:{ type: "number", nullable: true},
        depth:{ type: "number", nullable: true},
        volume:{ type: "number"},
        weight:{ type: "number"},
        arrived:{ type: "string", nullable: true},
        picked:{ type: "string", nullable: true},
        loaded:{ type: "string", nullable: true},
        pieces:{ type: "number"},
        notes:{ type: "string", nullable: true},
        anomalyID:{ type: "number", nullable: true},
        containerBarcode:{ type: "string", nullable: true},
        createdAt:{ type: "string"},
        updatedAt:{ type: "string"},
    }
}
/**
 * Anomaly
 */
exports.anomaly = {
    type: "object",
        properties: {
        ID : { type: "number"},
        clientBranchID : { type: "number"},
        typeID : { type: "number"},
        statusID : { type: "number"},
        description : { type: "string"},
        completedAt : { type: "string"},
        createdAt : { type: "string"},
        updatedAt : { type: "string"}
    }
}

/**
 * List of Items
 */
exports.items = {
    type: "array",
    items: exports.item
}
/**
 * Item Products
 */
exports.product = {
    type: "object",
    properties: {
        ID:{ type: "number"},
        clientID:{ type: "number"},
        code:{ type: "string"},
        eanCode:{ type: "string"},
        description:{ type: "string"},
        height:{ type: "number"},
        width:{ type: "number"},
        depth:{ type: "number"},
        volume:{ type: "number"},
        weight:{ type: "number"},
        variant:{ type: "string"},
        pieces:{ type: "number"},
        categoryID:{ type: "number"},
        isGeneric:{ type: "boolean"},
        createdAt:{ type: "string"},
        updatedAt:{ type: "string"},
        category:{
            type: "object",
                properties: {
                ID: {type: "number"},
                clientID: {type: "number"},
                name: {type: "string"},
                createdAt: {type: "string"},
                updatedAt: {type: "string"}
            }
        }
    }
}

/**
 * Location
 */
exports.location ={
    type: "object",
        properties: {
        ID:{type: "number"},
        warehouseID:{type: "number"},
        typeID:{type: "number"},
        row:{type: "string"},
        column:{type: "string"},
        floor:{type: "string"},
        barcode:{type: ""},
        x:{type: "number"},
        y:{type: "number"},
        note:{type: "string"},
        createdAt:{type: "string"},
        updatedAt:{type: "string"},
        warehouse: {
            type: "object",
                properties: {
                ID : { type: "number"},
                companyBranchID : { type: "number"},
                name : { type: "string"},
                createdAt : { type: "string"},
                updatedAt : { type: "string"}
            }
        }
    }
}

/**
 * Consignee
 */
exports.consignee ={
    type: "object",
    properties: {
        ID: {type: "number"},
        clientBranchID: {type: "number"},
        name: {type: "string"},
        surname: {type: "string"},
        address: {type: "string"},
        addressExtra: {type: "string"},
        postcode: {type: "string"},
        city: {type: "string"},
        country: {type: "string"},
        email: {type: "string"},
        phone: {type: "string"},
        createdAt: {type: "string"},
        updatedAt: {type: "string"},
    }
}

/**
 * Courier
 */
exports.courier ={
    type: "object",
    properties: {
        ID: {type: "number"},
        companyBranchID: {type: "number"},
        name: {type: "string"},
        createdAt: {type: "string"},
        updatedAt: {type: "string"},
    }
}

/**
 * Delivery
 */
exports.delivery ={
    type: "object",
    properties: {
        ID: {type: "number"},
        companyBranchID: {type: "number"},
        orderOutID: {type: "number"},
        deliveryRunID: {type: "number"},
        foreignID: {type: "string"},
        date: {type: "string"},
        documentFilename: {type: "string"},
        completedAt: {type: "string"},
        notes: {type: "string"},
        destinationLatitude: {type: "number"},
        destinationLongitude: {type: "number"},
        createdAt: {type: "string"},
        updatedAt: {type: "string"},
    }
}

/**
 * User
 */
exports.user ={
    type: "object",
    properties: {
        ID : { type: "number"},
        companyID : { type: "number"},
        warehouseID : { type: "number"},
        name : { type: "string"},
        surname : { type: "string"},
        username : { type: "string"},
        password : { type: "string"},
        email : { type: "string"},
        receiveEmails : { type: "boolean"},
        gender : { type: "string"},
        activatedAt : { type: "string"},
        createdAt : { type: "string"},
        updatedAt : { type: "string"}
    }
}

/**
 * Order out
 */

exports.orderOut = {
    type: "object",
    properties: {
        ID : { type: "number"},
        clientBranchID : { type: "number"},
        userID : { type: "number"},
        consigneeID : { type: "number"},
        requestedDeliveryDate : { type: "string"},
        statusID : { type: "number"},
        notes : { type: "string"},
        vanPlate : { type: "string"},
        courierID : { type: "number"},
        podFilename : { type: "string"},
        externalRef : { type: "string"},
        pickingStartedAt : { type: "string"},
        pickingCompletedAt : { type: "string"},
        loadingStartedAt : { type: "string"},
        loadingCompletedAt : { type: "string"},
        internalReference : { type: "string"},
        XMLCreatedAt : { type: "string"},
        packingListCreatedAt : { type: "string"},
        fileXML : { type: "string"},
        EDIUploadedAt : { type: "string"},
        XMLImportedCheckedAt : { type: "string"},
        packingListUploadedAt : { type: "string"},
        completedAt : { type: "string"},
        createdAt : { type: "string"},
        updatedAt : { type: "string"}
    }
}
/**
 * List of Orders Out
 */
exports.ordersOut = {
    type: "array",
    items: exports.orderOut
}

/**
 * List of Deliveries
 */
exports.deliveries = {
    type: "array",
    items: exports.delivery
}
