const logger = require("../../libs/logger");
const service = require("../main");
const db = require("../../libs/db");
const {Op} = require("sequelize");
const configs = require("../../configs");
const {v1: uuidv1} = require("uuid");
const utils = require('../../libs/utils')

exports.webhook = {
    shipmentUpdated: async (serviceUser, shipmentUpdatedEvent) => {
        /**
         * {
         *   "tracking_number": "9400111298370264401222",
         *   "status_code": "IT",
         * }
         */
        logger.info("ShipEngine webhook shipment/updated", {data: shipmentUpdatedEvent})

        const fulfillment = await db.fulfillment.findOne({
            where: {trackingNumber: shipmentUpdatedEvent.tracking_number},
            include: [
                { model: db.courier, as: 'courier'},
                {model: db.status, as: 'status'},
                {model: db.orderLineItem, as: 'orderLineItems'},
            ]
        })
        if (!fulfillment) {
            throw {status: 404, message: `Fulfillment with tracking number ${shipmentUpdatedEvent.tracking_number} not found`}
        }

        // ups shipping - if package has been picked up and fulfillment record has status created - set as dispatched
        if (fulfillment.courier.code == "ups" && (shipmentUpdatedEvent.carrier_status_code == "P" ||  shipmentUpdatedEvent.status_code == "IT") && fulfillment.status.name == 'created') {
            await service.fulfillment.dispatch(serviceUser, {
                fulfillmentID: fulfillment.ID,
                orderLineItems: fulfillment.orderLineItems.map(oli => {return {ID: oli.ID}})
            })
        }

        // dpd shipping - if package in transit up and fulfillment record has status created - set as dispatched
        if (fulfillment.courier.code == "dpd" && shipmentUpdatedEvent.status_code == "IT" && fulfillment.status.name == 'created') {
            await service.fulfillment.dispatch(serviceUser, {
                fulfillmentID: fulfillment.ID,
                orderLineItems: fulfillment.orderLineItems.map(oli => {return {ID: oli.ID}})
            })
        }

        return service.fulfillment.getOne(serviceUser, fulfillment.ID)
    }
}
