const express = require('express');
const {async, authorisationMiddleware, auditMiddleware} = require('../../utils/middleware');
const {firstItem} = require('../../utils/functionalHelpers');

module.exports = function(
    {logger, userService, authenticationMiddleware, audit}) {

    const router = express.Router();
    router.use(authenticationMiddleware());
    router.use(authorisationMiddleware);

    const audited = auditMiddleware(audit, 'USER_MANAGEMENT');

    router.use(function(req, res, next) {
        if (typeof req.csrfToken === 'function') {
            res.locals.csrfToken = req.csrfToken();
        }
        next();
    });

    router.get('/', (req, res) => {
        res.redirect('/admin/roUsers');
    });

    router.get('/roUsers', async(async (req, res) => {
        const roUsers = await userService.getRoUsers();
        return res.render('admin/users/list', {roUsers, heading: 'All RO users'});
    }));

    router.post('/roUsers', async(async (req, res) => {
        const {searchTerm} = req.body;

        if (searchTerm.trim() === '') {
            return res.redirect('/admin/roUsers');
        }

        const roUsers = await userService.findRoUsers(searchTerm);

        return res.render('admin/users/list', {roUsers, heading: 'Search results'});
    }));

    router.get('/roUsers/edit/:nomisId', async(async (req, res) => {
        const {nomisId} = req.params;
        const roUser = await userService.getRoUser(nomisId);
        const errors = firstItem(req.flash('errors')) || {};
        return res.render('admin/users/edit', {roUser, errors});
    }));

    router.post('/roUsers/edit/:nomisId', audited, async (req, res) => {
        const {nomisId} = req.params;
        const userInput = req.body;

        const error = validateIdentifiers(userInput);
        if (error) {
            req.flash('errors', error);
            return res.redirect(`/admin/roUsers/edit/${nomisId}`);
        }

        try {
            await userService.updateRoUser(nomisId, userInput);

        } catch (error) {
            req.flash('errors', {newNomisId: error.message});
            return res.redirect(`/admin/roUsers/edit/${nomisId}`);
        }

        res.redirect('/admin/roUsers');
    });

    router.get('/roUsers/delete/:nomisId', async(async (req, res) => {
        const {nomisId} = req.params;
        const roUser = await userService.getRoUser(nomisId);
        return res.render('admin/users/delete', {roUser});
    }));

    router.post('/roUsers/delete/:nomisId', audited, async(async (req, res) => {
        const {nomisId} = req.params;
        await userService.deleteRoUser(nomisId);
        res.redirect('/admin/roUsers');
    }));

    router.get('/roUsers/add', async (req, res) => {
        const errors = firstItem(req.flash('errors')) || {};
        return res.render('admin/users/add', {errors});
    });

    router.post('/roUsers/add', audited, async (req, res) => {
        const userInput = req.body;

        const error = validateIdentifiers(userInput);
        if (error) {
            req.flash('errors', error);
            return res.redirect('/admin/roUsers/add');
        }

        try {
            await userService.addRoUser(userInput);
            return res.redirect('/admin/roUsers');

        } catch (error) {
            req.flash('errors', {newNomisId: error.message});
            return res.redirect('/admin/roUsers/add');
        }
    });

    function validateIdentifiers(userInput) {
        if (userInput.newNomisId.trim() === '') {
            return {newNomisId: 'Nomis id is required'};
        }
        if (userInput.newDeliusId.trim() === '') {
            return {newDeliusId: 'Delius staff id is required'};
        }
    }

    return router;
};