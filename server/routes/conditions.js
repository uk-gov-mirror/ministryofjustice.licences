const { asyncMiddleware } = require('../utils/middleware')
const createStandardRoutes = require('./routeWorkers/standard')
const logger = require('../../log')
const { getIn } = require('../utils/functionalHelpers')
const formConfig = require('./config/licenceConditions')

module.exports = ({ licenceService, conditionsService }) => (router, audited) => {
  const standard = createStandardRoutes({ formConfig, licenceService, sectionName: 'licenceConditions' })

  router.get('/standard/:bookingId', getStandard)
  router.get('/standard/:action/:bookingId', getStandard)

  function getStandard(req, res) {
    logger.debug('GET /standard/:bookingId')

    const { action, bookingId } = req.params
    const standardConditions = conditionsService.getStandardConditions()
    const { additionalConditionsRequired } =
      getIn(res.locals.licence, ['licence', 'licenceConditions', 'standard']) || {}
    const {
      additionalConditions,
      pssConditions,
      bespokeConditions,
      unapprovedBespokeConditions,
    } = conditionsService.getNonStandardConditions(res.locals.licence.licence)

    res.render('licenceConditions/standard', {
      action,
      bookingId,
      standardConditions,
      additionalConditionsRequired,
      additionalConditions,
      pssConditions,
      bespokeConditions,
      unapprovedBespokeConditions,
    })
  }

  router.get('/additionalConditions/:bookingId', getAdditional)
  router.get('/additionalConditions/:action/:bookingId', getAdditional)

  function getAdditional(req, res) {
    logger.debug('GET /additionalConditions')

    const { action, bookingId } = req.params
    const licence = getIn(res.locals.licence, ['licence'])
    const bespokeConditions = getIn(licence, ['licenceConditions', 'bespoke']) || []
    const conditions = conditionsService.getAdditionalConditions(licence)
    let behaviours =
      getIn(conditions, ['Drugs, health and behaviour', 'base', 1, 'user_submission', 'abuseAndBehaviours']) || []

    if (typeof behaviours === 'string') {
      behaviours = [behaviours]
    }

    res.render('licenceConditions/additionalConditions', {
      action,
      bookingId,
      conditions,
      bespokeConditions,
      behaviours,
    })
  }

  router.post('/additionalConditions/:bookingId', audited, asyncMiddleware(postAdditional))
  router.post('/additionalConditions/:action/:bookingId', audited, asyncMiddleware(postAdditional))

  async function postAdditional(req, res) {
    logger.debug('POST /additionalConditions')
    const { bookingId, additionalConditions, bespokeDecision, bespokeConditions } = req.body
    const { action } = req.params
    const destination = action ? `${action}/${bookingId}` : bookingId

    const bespoke = (bespokeDecision === 'Yes' && bespokeConditions.filter((condition) => condition.text)) || []
    const additional = additionalConditions ? conditionsService.formatConditionInputs(req.body) : {}
    const newConditionsObject = conditionsService.createConditionsObjectForLicence(additional, bespoke)

    await licenceService.updateLicenceConditions(
      bookingId,
      res.locals.licence,
      newConditionsObject,
      res.locals.postRelease
    )

    res.redirect(`/hdc/licenceConditions/conditionsSummary/${destination}`)
  }

  router.get('/conditionsSummary/:bookingId', getConditionsSummary)
  router.get('/conditionsSummary/:action/:bookingId', getConditionsSummary)

  function getConditionsSummary(req, res) {
    const { bookingId, action } = req.params
    logger.debug('GET licenceConditions/conditionsSummary/:bookingId')

    const nextPath = formConfig.conditionsSummary.nextPath[action] || formConfig.conditionsSummary.nextPath.path
    const licence = getIn(res.locals.licence, ['licence']) || {}
    const additionalConditions = getIn(licence, ['licenceConditions', 'additional']) || {}
    const errorObject = licenceService.validateForm({
      formResponse: additionalConditions,
      pageConfig: formConfig.additional,
      formType: 'additional',
    })
    const data = conditionsService.populateLicenceWithConditions(licence, errorObject)

    const errorList = req.flash('errors')
    const errors = (errorList && errorList[0]) || {}
    res.render(`licenceConditions/conditionsSummary`, { bookingId, data, nextPath, action, errors })
  }

  router.post('/additionalConditions/:bookingId/delete/:conditionId', audited, asyncMiddleware(postDelete))
  router.post('/additionalConditions/:action/:bookingId/delete/:conditionId', audited, asyncMiddleware(postDelete))

  async function postDelete(req, res) {
    logger.debug('POST /additionalConditions/delete')
    const { bookingId, conditionId } = req.body
    const { action } = req.params

    if (conditionId) {
      await licenceService.deleteLicenceCondition(bookingId, res.locals.licence, conditionId)
    }

    const destination = action ? `${action}/` : ''

    res.redirect(`/hdc/licenceConditions/conditionsSummary/${destination}${bookingId}`)
  }

  router.get('/:formName/:bookingId', asyncMiddleware(standard.get))
  router.post('/:formName/:bookingId', audited, asyncMiddleware(standard.post))
  router.post('/:formName/:action/:bookingId', audited, asyncMiddleware(standard.post))

  return router
}
