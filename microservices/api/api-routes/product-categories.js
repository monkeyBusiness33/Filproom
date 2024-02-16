const express = require('express');
const router = express.Router();
const service = require('../services/main')

router.get("/", async (req, response, next) => {
    try {
        const products = await service.product.getAllCategories(req.user, req.query.offset, req.query.limit, req.query.sort, req.query)
        response.status(200).json(products)
    } catch(e) {
        next(e)
    }
})

module.exports = router;
