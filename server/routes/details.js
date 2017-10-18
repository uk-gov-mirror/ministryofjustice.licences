const express = require('express');
const asyncMiddleware = require('../utils/asyncMiddleware');

module.exports = function({logger, prisonerDetailsService, licenceService, authenticationMiddleware}) {
    const router = express.Router();
    router.use(authenticationMiddleware());

    router.use(function(req, res, next) {
        if (typeof req.csrfToken === 'function') {
            res.locals.csrfToken = req.csrfToken();
        }
        next();
    });

    router.get('/:nomisId', asyncMiddleware(async (req, res, next) => {
        logger.debug('GET /details');

        const nomisId = req.params.nomisId;

        const prisonerInfo = await prisonerDetailsService.getPrisonerDetails(nomisId);

        const details = {
            prisonerInfo,
            moment: require('moment')
        };

        res.render('details/index', details);
    }));

    router.post('/:nomisId', asyncMiddleware(async (req, res) => {
        logger.debug('POST /details');

        // TODO extract data from form and use to create licence

        const nomisId = req.params.nomisId;

        const existingLicence = await licenceService.getLicence(nomisId);

        if (existingLicence.length === 0) {
            await licenceService.createLicence(nomisId);
        }

        res.redirect('/dischargeAddress/'+nomisId);
    }));

    return router;
};
