/**
 * NOTES:
 * - Laced Fees:  Handling Fee 12%, Payment Fee 3%, Shipping Fee 6.99
 * 
 * TODO:
 * - 401 in production
 * - Check before calling editListing for changes
 */

const logger = require('../../libs/logger')
const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const qs = require('qs');
const db = require('../../libs/db');
const configs = require('../../configs');
const service = require('../main');
const lacedSampleData = require('../../scripts/lacedSampleData');
const utils = require('../../libs/utils');


/**
 * Control variables for basic things used for anti-bot detection checks.
 */
const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36';
const secChUa = '"Not.A/Brand";v="8", "Chromium";v="114", "Google Chrome";v="114"';
const secChUaPlatform = '"macOS"';

/* -------------------- OPERATION FUNCTIONS -------------------- */

exports.client = {

    /**
     * Used to create a basic Axios instance for performing needed actions
     * 
     * @returns A axios instance with a cookie jar attached
     */
    createInstance: () => {
        logger.info('Creating Laced Client Instance');

        const jar = new CookieJar();
        const client = wrapper(axios.create({
            jar,
            /* For testing purposes
            proxy: {
                protocol: 'http',
                host: 'localhost',
                port: 8888
            }
            */
        }));

        return client;
    }

}

exports.account = {

    /**
     * Needed to fetch CSRF Token which is needed for the login request.
     * Makes a GET request to sign in page and parses needed value.
     * 
     * @param {axios} client
     * 
     * @returns CSRF Token
     * @throws Error if request fails
     */
    getLoginPage: async (client) => {
        logger.info('Getting Laced Login Page');

        try {
            const resp = await client({
                url: 'https://www.laced.com/users//sign_in',
                method: 'GET',
                headers: {
                    'host': 'www.laced.com',
                    'sec-ch-ua': secChUa,
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': secChUaPlatform,
                    'upgrade-insecure-requests': '1',
                    'user-agent': userAgent,
                    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'sec-fetch-site': 'same-origin',
                    'sec-fetch-mode': 'navigate',
                    'sec-fetch-user': '?1',
                    'sec-fetch-dest': 'document',
                    'referer': 'https://www.laced.com/',
                    'accept-encoding': 'gzip, deflate, br',
                    'accept-language': 'en-US,en;q=0.9'
                }
            });

            const csrfToken = resp.data.match(/(?<=name="csrf-token" content=").*?(?=")/)[0];
            return csrfToken;
        } catch (e) {
            throw {
                status: e.response?.status || 500,
                message: e.response?.data || e.message
            }
        }
    },

    /**
     * Used to make login request to Laced.
     * 
     * @param {axios} client
     * @param {string} csrfToken 
     * @param {string} email 
     * @param {string} password 
     * 
     * @returns Boolean indicating if login was successful
     * @throws Error if request fails
     */
    login: async (client, csrfToken, email, password) => {
        logger.info('Attempting Laced Login');

        try {
            const resp = await client({
                url: 'https://www.laced.com/users//sign_in',
                method: 'POST',
                headers: {
                    'host': 'www.laced.com',
                    'cache-control': 'max-age=0',
                    'sec-ch-ua': secChUa,
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': secChUaPlatform,
                    'upgrade-insecure-requests': '1',
                    'origin': 'https://www.laced.com',
                    'content-type': 'application/x-www-form-urlencoded',
                    'user-agent': userAgent,
                    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'sec-fetch-site': 'same-origin',
                    'sec-fetch-mode': 'navigate',
                    'sec-fetch-user': '?1',
                    'sec-fetch-dest': 'document',
                    'referer': 'https://www.laced.com/users/sign_in',
                    'accept-encoding': 'gzip, deflate, br',
                    'accept-language': 'en-US,en;q=0.9'
                },
                data: qs.stringify({
                    'authenticity_token': csrfToken,
                    'user[email]': email,
                    'user[password]': password,
                    'user[remember_me]': '0',
                    'user[remember_me]': '1',
                    'locale': 'en',
                    'commit': 'Log in'
                })
            });

            if (resp.status === 200 && resp.data?.includes('Welcome Back')) {
                logger.info('Successfully logged into Laced');
                return true;
            }

            return false;
        } catch (e) {
            throw {
                status: e.response?.status || 500,
                message: e.response?.data || e.message
            }
        }
    },

    /**
     * Used to check if account profile is complete.
     * Needed as Laced requires a complete profile to be able to list items and perform more actions.
     * Is also used to determine if user is logged in as if not, response is always undefined.
     * 
     * @param {axios} client
     * 
     * @returns Boolean indicating if account verified and eligible for listings and so on. Returns null if not logged in.
     * @throws Error if request fails
     */
    checkAccount: async (client) => {
        logger.info('Checking Laced Account');

        try {
            const resp = await client({
                url: 'https://www.laced.com/api/users//me',
                method: 'GET',
                headers: {
                    'host': 'www.laced.com',
                    'sec-ch-ua': secChUa,
                    'accept': 'application/json, text/plain, */*',
                    'sec-ch-ua-mobile': '?0',
                    'user-agent': userAgent,
                    'sec-ch-ua-platform': secChUaPlatform,
                    'sec-fetch-site': 'same-origin',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-dest': 'empty',
                    'referer': 'https://www.laced.com/account/selling?status=active',
                    'accept-encoding': 'gzip, deflate, br',
                    'accept-language': 'en-US,en;q=0.9'
                },
                responseType: 'json'
            });
            const profileComplete = resp.data?.profile_complete;

            if (profileComplete) return true;
            if (profileComplete === undefined) return null;
            return false;
        } catch (err) {
            throw {
                status: err.response?.status || 500,
                message: err.response?.data || err.message
            }
        }
    }

}

exports.product = {

    /**
     * Used to search for a product based on string input inside Laced system.
     * Performs a public search on Laced site without login.
     * 
     * NOTE: .json has been added to end of the endpoint to force json response.
     * NOTE: Each page in response consists of max 20 products.
     * NOTE: We can assume offset from frontend will be a multiple of 20.
     * NOTE: Limit cannot be over 20 as that would need multiple network requests as max per page = 20.
     * 
     * @param {axios} client
     * @param {string} searchParams - An object consisting of search parameters. { 'offset': 0, 'limit': 25, 'search': 'Panda' }
     * 
     * @returns A json object consisting of key 'products' which is an array of all matching products json and the key 'nextPage' which is a int or null. 
     *  - Example: { "products": [{ "brand": "Air Jordan", "product_id": 12018, "image_url": "https://laced.imgix.net/products/f0a36439-a64a-4f01-87fb-3a4841b085e1.jpg", "title": "Air Jordan 1 Low Ice Blue GS", "display_price_cents": 9000, "formatted_display_price": "£90", "display_currency_code": "GBP", "href": "/products/air-jordan-1-low-ice-blue-gs", "price_cents": 9000, "currency_code": "GBP", "query_position": 1 }], "nextPage": null }
     */
    searchProduct: async (client, searchParams) => {
        logger.info(`Searching Product Data For Search Params: ${JSON.stringify(searchParams)}`);

        try {
            const targetPageNumber = (searchParams.offset / 20) + 1;

            const resp = await client({
                url: `https://www.laced.com//api/search.json?search%5Bsorted_by%5D=&search%5Bterm%5D=${encodeURIComponent(searchParams.search)}&page=${targetPageNumber}`,
                method: 'GET',
                headers: {
                    'host': 'www.laced.com',
                    'sec-ch-ua': secChUa,
                    'accept': 'application/json, text/plain, */*',
                    'sec-ch-ua-mobile': '?0',
                    'user-agent': userAgent,
                    'sec-ch-ua-platform': secChUaPlatform,
                    'sec-fetch-site': 'same-origin',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-dest': 'empty',
                    'referer': 'https://www.laced.com/',
                    'accept-encoding': 'gzip, deflate, br',
                    'accept-language': 'en-US,en;q=0.9'
                },
                responseType: 'json'
            });

            return (resp.data?.products ? resp.data : { products: [], nextPage: null });
        } catch (e) {
            throw {
                status: e.response?.status || 500,
                message: e.response?.data || e.message
            }
        }
    },

    /**
     * Used to search for variant data inside Laced system by using lacedProductID.
     * 
     * NOTE: Endpoint has been adapted to use laced product id at the end rather than product page href.
     * NOTE: Using laced product id at the end makes the request 302 to the proper location automatically.
     * 
     * @param {axios} client
     * @param {int} lacedProductID - Laced internal ID for a product. Example: '3641'
     * 
     * @returns A json consisting of all product data and variant data.
     */
    searchVariants: async (client, lacedProductID) => {
        logger.info(`Searching Variant Data for Product With ID: ${lacedProductID}`);

        try {
            const resp = await client({
                url: `https://www.laced.com/products//${lacedProductID}`,
                method: 'GET',
                headers: {
                    'host': 'www.laced.com',
                    'sec-ch-ua': secChUa,
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': secChUaPlatform,
                    'upgrade-insecure-requests': '1',
                    'user-agent': userAgent,
                    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'sec-fetch-site': 'same-origin',
                    'sec-fetch-mode': 'navigate',
                    'sec-fetch-user': '?1',
                    'sec-fetch-dest': 'document',
                    'referer': 'https://www.laced.com',
                    'accept-encoding': 'gzip, deflate, br',
                    'accept-language': 'en-US,en;q=0.9'
                },
                followRedirect: true
            });

            return JSON.parse(resp.data.match(/(?<="productInfo":)[\s\S]*?(?=,"showStockNotifyBtn)/g)[0]);
        } catch (e) {
            throw {
                status: e.response?.status || 500,
                message: e.response?.data || e.message
            }
        }
    },

    /**
     * Used to get the userID and CSRF token needed for creating a new listing.
     * 
     * @param {axios} client
     * @param {string} styleCode - Example 'DD1871-001'
     * 
     * @returns An object containing the userID and the CSRF token
     * @throws Error if request fails or certain data is missing
     */
    getUserIDAndCSRF: async (client, styleCode) => {
        logger.info(`Getting UserID And CSRF For Listing With Style Code: ${styleCode}`);

        try {
            const resp = await client({
                url: `https://www.laced.com/account/selling//new/${styleCode}`,
                method: 'GET',
                headers: {
                    'host': 'www.laced.com',
                    'sec-ch-ua': secChUa,
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': secChUaPlatform,
                    'upgrade-insecure-requests': '1',
                    'user-agent': userAgent,
                    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'sec-fetch-site': 'same-origin',
                    'sec-fetch-mode': 'navigate',
                    'sec-fetch-user': '?1',
                    'sec-fetch-dest': 'document',
                    'referer': `https://www.laced.com/account/selling/new?style_codes=${styleCode}`,
                    'accept-encoding': 'gzip, deflate, br',
                    'accept-language': 'en-US,en;q=0.9'
                }
            });

            const csrfToken = resp.data.split('name="csrf-token" content="')[1].split('"')[0];
            const userID = resp.data.split('"userId":')[1].split(',')[0];

            return { userID, csrfToken };
        } catch (e) {
            throw {
                status: e.response?.status || 500,
                message: e.response?.data || e.message
            }
        }
    },

    /**
     * Used to create a listing on Laced.
     * 
     * @param {axios} client
     * @param {string} csrfToken 
     * @param {int} productID 
     * @param {int} variantID 
     * @param {int} userID 
     * @param {int} price - In cents
     * @param {string} quantity
     * 
     * @returns listingID or error based on if listing was successful
     * @throws Error if request fails or listing is unsuccessful
     */
    createListing: async (client, csrfToken, productID, variantID, userID, price, quantity) => {
        logger.info(`Creating Listing For Product ID: ${productID} With Variant ID: ${variantID} And Price: ${price} With Quantity: ${quantity} For User with User ID: ${userID}`);

        try {
            const resp = await client({
                url: 'https://www.laced.com/api/selling//create',
                method: 'POST',
                headers: {
                    'host': 'www.laced.com',
                    'sec-ch-ua': secChUa,
                    'accept': 'application/json, text/plain, */*',
                    'content-type': 'application/json',
                    'sec-ch-ua-mobile': '?0',
                    'user-agent': userAgent,
                    'sec-ch-ua-platform': secChUaPlatform,
                    'origin': 'https://www.laced.com',
                    'sec-fetch-site': 'same-origin',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-dest': 'empty',
                    'referer': 'https://www.laced.com/account/selling/new/DD1391-100',
                    'accept-encoding': 'gzip, deflate, br',
                    'accept-language': 'en-US,en;q=0.9'
                },
                data: {
                    'authenticity_token': csrfToken,
                    'sale_collections': [{
                        'user_id': userID,
                        'quantity': quantity,
                        'price_in_cents': price,
                        'product_id': productID,
                        'size_conversion_id': variantID
                    }],
                    'user_id': userID
                },
                responseType: 'json'
            });

            const listingID = resp.data?.[0]?.id;

            if (!listingID) throw {
                status: resp.status || 200,
                message: resp.data || 'Missing listingID'
            }

            return listingID;
        } catch (e) {
            throw {
                status: e.response?.status || 500,
                message: e.response?.data || e.message
            }
        }
    },

    /**
     * Used to fetch all listings from an account for the input type and page number.
     * 
     * @param {axios} client
     * @param {string} type - 'active' or 'pending' or 'completed'
     * @param {int} pageNumber - Page number to fetch listings from
     * 
     * @returns An array containing the active listings for the input page
     * @throws Error if request fails
     */
    getListings: async (client, type, pageNumber) => {
        logger.info(`Getting Listings for type ${type} and page ${pageNumber}`);

        try {
            const cookies = client.defaults.jar.getCookieStringSync('https://www.laced.com/');
            const resp = await axios({
                url: 'https://api.scrapfly.io/scrape',
                method: 'GET',
                params: {
                    key: 'ac093ae635384dcf895be0f411b478d3',
                    url: `https://www.laced.com/account/selling?status=${type}&page=${pageNumber}`,
                    proxy_pool: 'public_residential_pool',
                    country: 'gb',
                    'headers[cache-control]': 'max-age=0',
                    'headers[sec-ch-ua]': secChUa,
                    'headers[sec-ch-ua-mobile]': '?0',
                    'headers[sec-ch-ua-platform]': secChUaPlatform,
                    'headers[upgrade-insecure-requests]': '1',
                    'headers[user-agent]': userAgent,
                    'headers[accept]': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'headers[sec-fetch-site]': 'same-origin',
                    'headers[sec-fetch-mode]': 'navigate',
                    'headers[sec-fetch-user]': '?1',
                    'headers[sec-fetch-dest]': 'document',
                    'headers[referer]': `https://www.laced.com/account/selling?status=${type}`,
                    'headers[accept-encoding]': 'gzip, deflate, br',
                    'headers[accept-language]': 'en-US,en;q=0.9',
                    'headers[cookie]': cookies
                }
            });

            const body = resp.data.result.content;

            /**
             * Happens on new accounts where nothing has been ever uploaded.
             */
            if (/You have no items for sale/g.test(body)) return { listings: [], count: 0 };

            /**
             * Fetching tabs object and parsing it to get the count of target listings.
             * This is needed to determine if we need to parse the listings or not.
             * No we cannot just throw an error at parsing listings as that object doesn't exist if there are no listings.
             * As long as get the correct page, tabs will always be there.
             */
            const tabs = JSON.parse(body.match(/(?<=tabs":)[\s\S]*?(?=])/gm)[0] + ']');
            const parsedTabData = tabs.map(tab => {
                return {
                    status: tab.href.split('=')[1],
                    count: tab.label.match(/\d+/g) ? parseInt(tab.label.match(/\d+/g)[0]) : 0
                }
            });
            if (parsedTabData.length === 0) throw { status: 500, message: 'Failed to fetch tabs' };

            const targetTabData = parsedTabData.find(tab => tab.status === type);
            if (!targetTabData?.count) return { listings: [], count: 0 }; // targetTab might not always exists for ex if account has no cancels

            const listingMatches = body.match(/(?={"imageUrl":).*(?=<\/script>)/g);
            const listings = listingMatches.map((listing) => JSON.parse(listing));
            return { listings, count: targetTabData.count };
        } catch (e) {
            throw {
                status: e.response?.status || 500,
                message: (e.response?.data?.result?.error ? JSON.stringify(e.response?.data?.result?.error) : "") || e.message
            }
        }
    },

    /**
     * Used to fetch the Edit listing page.
     * Needed to fetch the CSRF token needed to make the edit request.
     * 
     * @param {axios} client
     * @param {string} listingID
     *
     * @returns A string containing the CSRF token
     * @throws Error if request fails
     */
    getEditListingCSRF: async (client, listingID) => {
        logger.info(`Getting CSRF to Edit Listing With ID: ${listingID}`);

        try {
            const resp = await client({
                url: `https://www.laced.com/account/selling/${listingID}//edit`,
                method: 'GET',
                headers: {
                    'host': 'www.laced.com',
                    'sec-ch-ua': secChUa,
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': secChUaPlatform,
                    'upgrade-insecure-requests': '1',
                    'user-agent': userAgent,
                    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'sec-fetch-site': 'same-origin',
                    'sec-fetch-mode': 'navigate',
                    'sec-fetch-user': '?1',
                    'sec-fetch-dest': 'document',
                    'referer': `https://www.laced.com/account/selling?status=active`,
                    'accept-encoding': 'gzip, deflate, br',
                    'accept-language': 'en-US,en;q=0.9'
                }
            });

            const csrfToken = resp.data.split('name="csrf-token" content="')[1].split('"')[0];
            return csrfToken;
        } catch (e) {
            throw {
                status: e.response?.status || 500,
                message: e.response?.data || e.message
            }
        }
    },

    /**
     * Used to make the request needed to edit an existing listing.
     * 
     * @param {axios} client
     * @param {string} csrfToken 
     * @param {string} listingID 
     * @param {string} productID
     * @param {string} variantID
     * @param {string} price 
     * @param {string} quantity
     * 
     * @returns Boolean indicating if listing was edited successfully
     * @throws Error if request fails
     */
    editListing: async (client, csrfToken, listingID, productID, variantID, price, quantity) => {
        logger.info(`Editing Listing With With Following Data: ${JSON.stringify({ listingID, productID, variantID, price, quantity })}`);

        try {
            const resp = await client({
                url: `https://www.laced.com/account/selling//${listingID}`,
                method: 'POST',
                headers: {
                    'host': 'www.laced.com',
                    'cache-control': 'max-age=0',
                    'sec-ch-ua': secChUa,
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': secChUaPlatform,
                    'upgrade-insecure-requests': '1',
                    'origin': 'https://www.laced.com',
                    'content-type': 'application/x-www-form-urlencoded',
                    'user-agent': userAgent,
                    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'sec-fetch-site': 'same-origin',
                    'sec-fetch-mode': 'navigate',
                    'sec-fetch-user': '?1',
                    'sec-fetch-dest': 'document',
                    'referer': `https://www.laced.com/account/selling/${listingID}/edit`,
                    'accept-encoding': 'gzip, deflate, br',
                    'accept-language': 'en-US,en;q=0.9'
                },
                data: qs.stringify({
                    '_method': 'put',
                    'authenticity_token': csrfToken,
                    'sale_collection[product_id]': productID,
                    'sale_collection[size_conversion_id]': variantID,
                    'sale_collection[quantity]': quantity,
                    'sale_collection[price_in_cents]': price
                }),
                maxRedirects: 0
            });

            throw { status: resp.status || 500, message: resp.data || 'Failed to edit listing' };
        } catch (e) {
            if (e.response?.status === 302 && e.response?.headers?.location?.includes('/account/selling?status=active')) return true;

            throw {
                status: e.response?.status || 500,
                message: e.response?.data || e.message
            }
        }

    }

}

/* -------------------- CONTROLLER FUNCTIONS -------------------- */

exports.search = {

    /**
     * Used to search products via string input inside Laced and then map the data and return as needed for Frontend
     * 
     * @param {object} data - { 'offset': 0, 'limit': 25, 'search': 'ghj' }
     * 
     * @returns A json object consisting of mapped product data array under key 'rows' and a key 'count' as needed as per frontend specifications
     */
    getAll: async (data) => {
        logger.info('Laced Search - getAll', { data })

        /**
         * Creating a client instance needed to make the HTTP requests
         */
        const client = exports.client.createInstance();

        /**
         * Used to fetch listing data internal to Laced using input query string
         */
        let rawLacedSearch;
        try {
            rawLacedSearch = await exports.product.searchProduct(client, data);
        } catch (e) {
            throw e;
        }

        /**
         * Mapping raw response from Laced to an internal product format
         */
        const parsedProducts = rawLacedSearch.products?.map(rawProd => ({
            ID: null,
            lacedID: rawProd.product_id,
            title: rawProd.title,
            imageReference: rawProd.image_url,
            variants: []
        })) ?? [];

        /**
         * Count has been manipulated to make it work with the frontend logic without drastic design changes
         * If next page is null, we return count as 0 so that according to frontend logic, user cannot fetch more and it does not cause an infinite loop
         * If next page is a number, we return an arbitrary big value so it can display the max count for that page which is 20
         */
        return { rows: parsedProducts, count: rawLacedSearch.nextPage ? 9999999 : 0 };
    },

    /**
     * Used to get the variant data for a given product internally from Laced system.
     * 
     * @param {int} lacedProductID
     * 
     * @returns A json object consisting of mapped product data as needed for frontend with included variant data
     */
    getById: async (lacedProductID) => {
        logger.info('Laced Search - getById', lacedProductID)

        /**
         * Creating a client instance needed to make the HTTP requests
         */
        const client = exports.client.createInstance();

        /**
         * Used to fetch product data internal to Laced for a specific product ID
         */
        let productData;
        try {
            productData = await exports.product.searchVariants(client, lacedProductID);
        } catch (e) {
            throw e;
        }

        /**
         * Mapping raw response from Laced to an internal product format.
         * 
         * NOTE: We reparse all data including parent object data so we do not need to pass it around between different calls and functions.
         */
        const variants = productData.allSizeConversions?.map(sizeData => ({
            ID: null,
            lacedID: sizeData.id,
            name: sizeData.international_size_label
        }));
        if (!variants?.length) throw { status: 500, message: 'Failed to find variants' }

        return {
            ID: null,
            code: productData.styleCode,
            lacedID: productData.productId,
            title: productData.title,
            imageReference: productData.imageUrl,
            variants
        }
    }

}

exports.listing = {

    /**
     * Manages flow for creating a new listing on Laced.
     * 
     * @param {number} inventoryListingID - The invenotryListingID on laced that needs to be generated
     * 
     * @returns listingID or error based on if listing was successful
     * @throws Error if request fails or listing is unsuccessful
     */
    create: async (inventoryListingID) => {
        logger.info('Create Laced listing', {inventoryListingID});

        /**
         * Input data checks to ensure its there as needed
         */
        if (!inventoryListingID) throw { status: 400, message: 'Missing inventoryListingID' }

        /**
         * Parsing out laced listing from inventory record
         */
        const lacedListing = await db.inventoryListing.findOne({
            where: {ID: inventoryListingID},
            include: [
                { model: db.product, as: 'product' },
                { model: db.productVariant, as: 'variant' },
                { model: db.inventory, as: 'inventory' },
                { model: db.saleChannel, as: 'saleChannel', include: [{ model: db.transactionRate, as: 'fees'},] }
            ]
        })
        if (!lacedListing) throw { status: 400, message: 'Listing for inventoryListingID does not exist' }

        const lacedSaleChannel = await service.account.getLacedSaleChannel(lacedListing.accountID);

        /**
         * Parsing out needed data from laced listing
         */
        const productID = lacedListing.product.lacedID;
        const variantID = lacedListing.variant.lacedID;
        const styleCode = lacedListing.product.lacedCode;
        const quantity = lacedListing.inventory.quantity;

        /**
         * Parsing out price info and converting it as needed for Laced
         * Laced requires the price to be sent in cents and the GBP amount to be a multiple of 5
         */
        const price = parseFloat(lacedListing.price);
        const updatedPrice = (Math.ceil(price / 5) * 5) * 100;

        if (configs.environment == "local") {
            return {
                lacedListingID: 123456789,
                productID: lacedListing.product.lacedID,
                variantID: lacedListing.variant.lacedID,
                styleCode: lacedListing.product.lacedCode,
                quantity: lacedListing.inventory.quantity,
                price: updatedPrice,
            }
        }

        /**
         * Creating a client instance needed to make the HTTP requests 
         */
        const client = exports.client.createInstance();

        /**
         * Login into user account
         */
        try {
            const csrfToken = await exports.account.getLoginPage(client);
            const success = await exports.account.login(client, csrfToken, lacedSaleChannel.email, lacedSaleChannel.password);

            if (!success) throw { status: 500, message: 'Failed to login to Laced' }
        } catch (e) {
            throw e;
        }

        /**
         * Used to fetch user ID and CSRF token needed to create a listing
         */
        let data;
        try {
            data = await exports.product.getUserIDAndCSRF(client, styleCode);
        } catch (e) {
            throw e;
        }

        /**
         * Creating an actual listing on the Laced system
         * Stores the listingID returned from Laced in the database
         * Updated the inventory listing price to the updated price and the lacedID to the listingID returned from Laced
         * Laced needs a sale price is cents. Convert back to normal currency when saving it back to the database
         */
        let listingID
        try {
            listingID = await exports.product.createListing(client, data.csrfToken, productID, variantID, data.userID, updatedPrice, quantity);
            let internalUpdatedPrice = updatedPrice/100
            let internalUpdatedPayout = utils.computeSaleChannelPayout(lacedListing.saleChannel, lacedListing)
            await db.inventoryListing.update({lacedID:listingID, price: internalUpdatedPrice, payout:internalUpdatedPayout },{where: {ID: lacedListing.ID}} ) // TODO: Check price update and return type for it
        } catch (e) {
            throw e;
        }

        return listingID;
    },

    /**
     * Manages flow for updating a listing on Laced.
     * 
     * @param {inventoryListing} inventoryListing - The inventoryListing on laced that needs to be updated
     */
    update: async (inventoryListing) => {
        logger.info('Update Laced listing', { inventoryListing });

        /**
         * Input data checks to ensure its there as needed
         */
        if (!inventoryListing) throw { status: 400, message: 'Missing inventoryListingID' }

        /**
         * Parsing out laced listing from inventory record
         */
        const lacedListing = inventoryListing

        if (!lacedListing) throw { status: 400, message: 'Listing for inventoryListingID does not exist' }
        const lacedSaleChannel = await service.account.getLacedSaleChannel(lacedListing.accountID);

        /**
         * Parsing out needed data from laced listing
         */
        const listingID = lacedListing.lacedID;
        const productID = lacedListing.product.lacedID;
        const variantID = lacedListing.variant.lacedID;
        const quantity = lacedListing.inventory.quantity;

        /**
         * Parsing out price info and converting it as needed for Laced
         * Laced requires the price to be sent in cents and the GBP amount to be a multiple of 5
         */
        const price = parseFloat(lacedListing.price);
        const updatedPrice = (Math.ceil(price / 5) * 5) * 100;

        if (configs.environment == "local") {
            return {
                lacedListingID: 123456789,
                productID: lacedListing.product.lacedID,
                variantID: lacedListing.variant.lacedID,
                styleCode: lacedListing.product.lacedCode,
                quantity: lacedListing.inventory.quantity,
                price: updatedPrice,
            }
        }

        /**
         * Creating a client instance needed to make the HTTP requests 
         */
        const client = exports.client.createInstance();


        /**
         * Login into user account
         */
        try {
            const csrfToken = await exports.account.getLoginPage(client);
            const success = await exports.account.login(client, csrfToken, lacedSaleChannel.email, lacedSaleChannel.password);

            if (!success) throw { status: 500, message: 'Failed to login to Laced' }
        } catch (e) {
            throw e;
        }

        /**
         * Used to fetch CSRF token needed to edit a listing
         */
        let csrfToken;
        try {
            csrfToken = await exports.product.getEditListingCSRF(client, listingID);
        } catch (e) {
            throw e;
        }

        /**
         * Editing listing inside Laced system
         * Updates the inventory listing price to the updated price
         */
        let success
        try {
            success = await exports.product.editListing(client, csrfToken, listingID, productID, variantID, updatedPrice, quantity);
            let internalUpdatedPrice = updatedPrice/100
            let internalUpdatedPayout = utils.computeSaleChannelPayout(lacedListing.saleChannel,lacedListing)

            await db.inventoryListing.update({ price: internalUpdatedPrice,payout: internalUpdatedPayout}, { where: { ID: lacedListing.ID } }); // TODO: Check price update and return type for it
        } catch (e) {
            throw e;
        }

        return success;
    },

    /**
     * 
     * @param {string} type - Listings type to fetch. Can be 'active' or 'pending' or 'sold' or 'cancelled'
     * @param {axios} client - Axios client instance to be used for making requests
     * 
     * @returns An array of json objets consisting of all listings for the input type
     * @throws Error if request fails
     */
    fetchAll: async (type, client) => {
        logger.info(`listings.fetchAll - status ${type}`);

        /**
         * Input data checks to ensure its there as needed
         */
        if (!type) throw { status: 400, message: 'Missing type for fetching listings' }

        /**
         * Fetch all listings on Laced for the used account for given type
         */
        let data = [];
        try {
            let page = 1;
            let listings = [];
            let count = 0;

            /**
             * The below algorithm works as Laced always has a set page size of 20
             * Only case where 20 items are not returned is if there are less than 20 items in total
             */
            do {
                const response = await exports.product.getListings(client, type, page);
                listings = response.listings;
                count = response.count;

                data.push(... listings);

                /**
                 * If we have less than 20 items, we can break the loop as we have fetched all items
                 * Also if we have fetched all items, we can break the loop (Exactly 20 items)
                 */
                if (listings.length !== 20 || (type === 'active' ? (data.reduce((acc, curr) => acc + parseInt(curr.info.split(' ')[0]) , 0) === count) : data.length === count)) break;

                page += 1;
            } while (listings.length === 20);

        } catch (e) {
            throw e;
        }

        return data
    },

    /**
     * Used to sync up internal inventory in Fliproom with Laced one to check for new sales
     * 
     * @param {object} user - User object for which to sync listings
     */
    sync: async(user) => {
        logger.info(`[LACED SYNC] Syncing Laced listings for user: ${user.accountID}`);

        // configs.environment = 'prod'; // For testing

        /**
         * TODO: Fetch this from the user object
         */

        const lacedSaleChannel = await service.account.getLacedSaleChannel(user.accountID);
        const accountID =  user.accountID;

        /**
         * TODO: Fetch this from 'lacedCredential'
         */
        const salesChannelID = lacedSaleChannel.ID;
        const email =  lacedSaleChannel.email;
        const password = lacedSaleChannel.password;

        /**
         * Figure out service user to be able to use internal API
         */
        const serviceUser = await service.account.serviceUser(accountID)

        /**
         * Fetch all internal order line items for the account ID and sales channel ID
         */
        const internalLacedOrderLineItems = configs.environment != 'prod' ? [] : (await service.orderLineItem.getAll(serviceUser, 0, 999999, { accountID: serviceUser.accountID, 'order.saleChannelID': salesChannelID })).rows;

        //Fetch all internal inventory listings for the account ID and sales channel ID
        const internalLacedInventoryListings = configs.environment != 'prod' ? lacedSampleData.cypressTestInternalLacedInventoryListings : (await service.inventoryListing.getAll(serviceUser, 0, 999999, { accountID: serviceUser.accountID, saleChannelID: salesChannelID })).rows;

        /**
         * This variable keep track of remaining laced listings to process. If gets to 0 before the end of the script, we can abort earlier and avoid unnecessary processing
         * - At the beginning we assume that all laced listings are missing on fliproom. As we process them, we remove them from this array.
         * - We get alll laced listings (inventoryListing.lacedID) from service.inventoryListing.getAll() 
         * - Constructing an array of laceIDs for internal inventory listings to be able to compare with activeLacedListings
         * 
         * //TODO: rename to missingLacedListingIDsToProcess 
         */
        let missingInternalLacedInventoryListingsLacedIDs = internalLacedInventoryListings.map(listing => listing.lacedID).filter(lacedID => lacedID)
        logger.info(`[LACED SYNC] missingLacedListingIDsToProcess ${missingInternalLacedInventoryListingsLacedIDs.length}`, {data: missingInternalLacedInventoryListingsLacedIDs})

        /**
         * Create an HTTP client instance to be able to make requests to Laced
         */
        const client = exports.client.createInstance();

        /**
         * Perform Laced login as monitoring inventory and retriving it requires user to be logged in
         */
        if (configs.environment == "prod") {
            try {
                const csrfToken = await exports.account.getLoginPage(client);
                const success = await exports.account.login(client, csrfToken, email, password);

                if (!success) throw { status: 500, message: 'Failed to login to Laced' }
            } catch (e) {
                throw e;
            }
        }

        /**
         * Fetch all active listings on laced
         */
        let activeLacedListings = [];

        if (configs.environment != 'prod') {
            activeLacedListings = lacedSampleData.activeLacedListings;
        } else {
            try {
                activeLacedListings = await service.bridge.laced.listing.fetchAll('active', client);
            } catch (e) {
                throw e;
            }
        }
        logger.info(`[LACED SYNC] LACED active listings: ${activeLacedListings.length}`)

        /**
         * Extract laced listings that we are tracking internally thourgh inventoryListing.lacedID and discard all the others
         * - discard all the others listings on Laced under active tab which we do not have any track for
         */
        const trackedLacedListings = [];
        activeLacedListings.forEach(listing => {
            // Simply checks if the listing is tracked by fliproom by checking if the lacedID of the listing is in the array of missingInternalLacedInventoryListingsLacedIDs
            if (missingInternalLacedInventoryListingsLacedIDs.includes(listing.actions[1].id)) {
                trackedLacedListings.push(listing);

                const matchIndex = missingInternalLacedInventoryListingsLacedIDs.indexOf(listing.actions[1].id);
                missingInternalLacedInventoryListingsLacedIDs.splice(matchIndex, 1);
            }
        });
        logger.info(`[LACED SYNC] missingLacedListingIDsToProcess ${missingInternalLacedInventoryListingsLacedIDs.length}`, {data: missingInternalLacedInventoryListingsLacedIDs})

        /**
         * For listings for which we found a match, we need to check if the price and quantity match
         * 
         * Currently we do not do anything if price of the matched listings isnt same but we store it for use as needed for the future
         * Currently we also do not do anything if quantity of the matched listing has increased but we store it for use as needed for the future
         * 
         * We also store the listings for which the quantity has decreased as that might be caused due to new sales coming in. TODO: What if user manually lowers QTY
         */
        const mismatchedLacedPriceListings = [];
        const mismatchedLacedQuantityIncreaseListings = [];
        const mismatchedLacedQuantityDecreaseListings = [];
        trackedLacedListings.forEach(listing => {
            /**
             * Find internal listing data for the matched listing and find the needed vars to compare price and quantity
             */
            const internalListing = internalLacedInventoryListings.find(internalListing => internalListing.lacedID == listing.actions[1].id);

            const internatListingPrice = parseFloat(internalListing.inventory.cost);
            const internalListingQuantity = internalListing.inventory.quantity;

            /**
             * Figure out price and quantity on the laced listing
             */
            const lacedListingPrice = parseFloat(listing.price.slice(1).replace(/,/g, ''));
            const lacedListingQuantity = parseInt(listing.info.split(' ')[0]);

            /**
             * If prices dont match, add it to the mismatchedLacedPriceListings array to keep track
             */
            if (internatListingPrice != lacedListingPrice) {
                mismatchedLacedPriceListings.push(listing);
            }

            /**
             * If quantities dont match, add it to the mismatchedLacedQuantityIncreaseListings or mismatchedLacedQuantityDecreaseListings array to keep track
             */
            if (internalListingQuantity != lacedListingQuantity) {
                if (internalListingQuantity < lacedListingQuantity) mismatchedLacedQuantityIncreaseListings.push({ listing, quantity: lacedListingQuantity - internalListingQuantity });
                if (internalListingQuantity > lacedListingQuantity) mismatchedLacedQuantityDecreaseListings.push({ listing, quantity: internalListingQuantity - lacedListingQuantity });
            }
        });

        /**
         * For each object in mismatchedLacedQuantityDecreaseListings, we add the lacedID of the listing to the missingInternalLacedInventoryListingsLacedIDs array for the number of times the quantity has decreased
         * This is because we assume that the quantity has decreased due to new sales coming in so we can treat them as unique missing listings
         */
        mismatchedLacedQuantityDecreaseListings.forEach(object => {
            for (let i = 0; i < object.quantity; i++) {
                missingInternalLacedInventoryListingsLacedIDs.push(object.listing.actions[1].id);
            }
        });

        logger.info(`[LACED SYNC] missingLacedListingIDsToProcess ${missingInternalLacedInventoryListingsLacedIDs.length}`, {data: missingInternalLacedInventoryListingsLacedIDs})
        //if no new sales, missingInternalLacedInventoryListingsLacedIDs would be length 0 and we can return - otherwise move on and check for sales to import
        if (missingInternalLacedInventoryListingsLacedIDs.length == 0) return 'ok';

        /**
         * At this point, we know we have some mismatched or missing listings which means we might have some new sales
         * We pull all listings from Laced under pending tab and try to match them with the missing listings or mismatched listings
         */
        let pendingLacedListings = [];
        if (configs.environment != 'prod') {
            pendingLacedListings = lacedSampleData.pendingLacedListings;
        } else {
            try {
                pendingLacedListings = await service.bridge.laced.listing.fetchAll('pending', client);
            } catch (e) {
                throw e;
            }
        }
        logger.info(`[LACED SYNC] LACED pending listings: ${pendingLacedListings.length}`)

        /**
         * We call findDifferences function to find the missing listings and mismatched listings indicating new potential sales amongst pending listings
         */
        const pendingDifferences = await exports.listing.findDifferences(serviceUser,internalLacedInventoryListings, missingInternalLacedInventoryListingsLacedIDs, internalLacedOrderLineItems, pendingLacedListings);
        
        /**
         * Based on the return value of pendingDifferences, we updated the needed vars
         * We update missingInternalLacedInventoryListingsLacedIDs array to remove the ones that were matched and make sure its in sync
         */
        missingInternalLacedInventoryListingsLacedIDs = pendingDifferences.missingInternalLacedInventoryListingsLacedIDs;


        /**
         * We calculate potential new sales counter again to see if we have any missing sales or data to be matched
         * If there is no more data to be matched, we can return
         */
        if (missingInternalLacedInventoryListingsLacedIDs.length <= 0) return 'ok';

        /**
         * At this point, we know we still have some mismatched or missing listings which means we might have some new sales
         * We pull all listings from Laced under completed tab and try to match them with the missing listings or mismatched listings
         */
        let completedLacedListings = [];
        if (configs.environment != 'prod') {
            completedLacedListings = lacedSampleData.completedLacedListings;
        } else {
            try {
                completedLacedListings = await service.bridge.laced.listing.fetchAll('sold', client);
            } catch (e) {
                throw e;
            }
        }
        logger.info(`[LACED SYNC] LACED sold listings: ${completedLacedListings.length}`)

        /**
         * We call findDifferences function to find the missing listings and mismatched listings indicating new potential sales amongst completed listings
         */
        const completedDifferences = await exports.listing.findDifferences(serviceUser,internalLacedInventoryListings, missingInternalLacedInventoryListingsLacedIDs, internalLacedOrderLineItems, completedLacedListings);
        
        /**
         * Based on the return value of pendingDifferences, we update needed vars
         * We update missingInternalLacedInventoryListingsLacedIDs array to remove the ones that were matched and make sure its in sync
         */
        missingInternalLacedInventoryListingsLacedIDs = completedDifferences.missingInternalLacedInventoryListingsLacedIDs;

         /**
         * We calculate potential new sales counter again to see if we have any missing sales or data to be matched
         * If there is no more data to be matched, we can return
         */
        if (missingInternalLacedInventoryListingsLacedIDs.length <= 0) return 'ok';

        if (configs.environment != 'prod') {
            return {
                missingInternalLacedInventoryListingsLacedIDs
            };
        }

        /**
         * At this point, we know we still have some mismatched or missing listings which means we might have some new sales
         * We pull all listings from Laced under completed tab and try to match them with the missing listings or mismatched listings
         */
        let cancelledLacedListings = [];
        try {
            cancelledLacedListings = await service.bridge.laced.listing.fetchAll('cancelled', client);
        } catch (e) {
            throw e;
        }
        logger.info(`[LACED SYNC] LACED cancelled listings: ${cancelledLacedListings.length}`)

        /**
         * We call findDifferences function to find the missing listings and mismatched listings indicating new potential sales amongst completed listings
         */
        const cancelledDifferences = await exports.listing.findDifferences(serviceUser,internalLacedInventoryListings, missingInternalLacedInventoryListingsLacedIDs, internalLacedOrderLineItems, cancelledLacedListings);
        

        missingInternalLacedInventoryListingsLacedIDs = cancelledDifferences.missingInternalLacedInventoryListingsLacedIDs;


        // TODO: What do we want to do with cancelled listing and remaining unmatched lisings?

        return;
    },

    /**
     * Handles the logic for actually finding the matching listings and creating new sales for them
     * Also handles the logic for updating the missingInternalLacedInventoryListingsLacedIDs array to remove the ones that were matched
     * 
     * @param {object} user - User object
     * @param {object} internalLacedInventoryListings - Array of internal inventory listings with laced channel
     * @param {object} missingInternalLacedInventoryListingsLacedIDs - Array of lacedIDs for internal inventory listings which do not have any track of on Laced
     * @param {object} internalLacedOrderLineItems - Array of internal order line items with laced channel
     * @param {object} lacedListings - Array of listings from Laced to compare to
     * @returns 
     */
    async findDifferences(user, internalLacedInventoryListings, missingInternalLacedInventoryListingsLacedIDs, internalLacedOrderLineItems, lacedListings) {

        /**
         * We construct an array of foreignIDs for internal orders with laced channel inside Fliproom
         * We do this because these are already recorded sales so we can omit looking and investigating data matching to this
         */
        const internalLacedOrdersLineItemForeignIDs = internalLacedOrderLineItems.map(oli => oli.order.foreignID);

        /**
         * Here we build an array of Laced listings which do not have any internal Fliproom order ID associated with them
         */
        const missingLacedListings = [];
        lacedListings.forEach(listing => {
            const lacedOrderID = listing.actions[0].href.split('/').slice(-1).pop(); // TODO: Check if same parsing works for completed
            if (!internalLacedOrdersLineItemForeignIDs.includes(lacedOrderID)) missingLacedListings.push(listing);
        });

        logger.debug(`Missing Laced Listings: ${missingLacedListings.length}`, {data: missingLacedListings})

        /**
         * Now, we have an array of missing listings on Laced which does not match any order inside Fliproom
         * We try to match these missing Laced listings with the missing internal Fliproom listings to see if we can find a match indicating a new sale
         * We keep track of matching indexes in missingInternalLacedInventoryListingsLacedIDs array to remove values at those indexes later as they indicate potential new sales
         *   - We cannot simply remove the value from the array in the algorithm below as it will mess up the indexes for the next iteration
         */
        const matchedLacedListings = [];
        const matchedIndexesForMissingInternalListingIDs = [];
        for (let i = 0; i < missingLacedListings.length; i++) {

            const lacedListing = missingLacedListings[i];

            for (let j = 0; j < missingInternalLacedInventoryListingsLacedIDs.length; j++) {
                const lacedID = missingInternalLacedInventoryListingsLacedIDs[j];

                const internalListing = internalLacedInventoryListings.find(internalListing => internalListing.lacedID == lacedID);


                //Matching Item
                if (lacedListing.title.label == internalListing.product.lacedTitle &&
                    lacedListing.subInfo == internalListing.product.lacedCode &&
                    lacedListing.info == internalListing.variant.lacedName
                ) {
                    const lacedOrderID = lacedListing.actions[0].href.split('/').slice(-1).pop();
                    const salePrice = lacedListing.price.replace(/[^0-9]/g, '');


                    //get fulfillment centre from account warehouses
                    const fulfillmentCentre = user.account.warehouses.find(warehouse => warehouse.fulfillmentCentre == true);
                    if (!fulfillmentCentre) throw new Error(`No fulfillment centre found for account ${user.accountID}`)


                    logger.info(`Found a new sale for ${lacedListing.title.label} - ${lacedListing.subInfo} - ${lacedListing.info} - Laced Order ID: ${lacedOrderID}`);

                    const rawSaleOrder = {
                        "accountID": user.accountID,
                        "foreignID": lacedOrderID,
                        "saleChannelID": internalListing.saleChannelID,
                        "reference1": lacedOrderID,
                        "type": "outbound",
                        "consignee": null,
                        "consignorID": fulfillmentCentre.addressID,
                        "details": [
                            {
                                "itemID": internalListing.inventory.items[0].ID,
                                "price": salePrice
                            }
                        ],
                        "fulfillment": {
                            "setAsDispatched": false,
                            "setAsDelivered": false
                        },
                        "transactions": [
                            {
                                "grossAmount": salePrice,
                                "currency": "GBP",
                                "type": "sale",
                                "status": "paid",
                                "paymentMethod": null,
                                "reference": lacedOrderID,
                            }
                        ]
                    }

                    if (configs.environment == 'prod') {
                        try {
                            await service.order.createSaleOrder(user, rawSaleOrder);
                        } catch (e) {
                            console.log(e)
                        }
                    }

                    matchedLacedListings.push(lacedListing);

                    matchedIndexesForMissingInternalListingIDs.push(j);
                    break;
                }

            }

        }

        /**
         * Filter out missingInternalLacedInventoryListingsLacedIDs array to remove the ones that were matched
         */
        missingInternalLacedInventoryListingsLacedIDs = missingInternalLacedInventoryListingsLacedIDs.filter((_, index) => !matchedIndexesForMissingInternalListingIDs.includes(index));

        return { missingInternalLacedInventoryListingsLacedIDs };
    }

}
