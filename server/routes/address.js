const { asyncMiddleware } = require('../utils/middleware')
const createStandardRoutes = require('./routeWorkers/standard')
const { getIn, mergeWithRight, omit, isEmpty, isYes } = require('../utils/functionalHelpers')
const formConfig = require('./config/proposedAddress')

module.exports = ({ licenceService, nomisPushService }) => (router, audited, { pushToNomis }) => {
  const standard = createStandardRoutes({ formConfig, licenceService, sectionName: 'proposedAddress' })

  router.get('/curfewAddressChoice/:action/:bookingId', asyncMiddleware(getChoice))
  router.get('/curfewAddressChoice/:bookingId', asyncMiddleware(getChoice))

  function getChoice(req, res) {
    const { bookingId } = req.params
    const { licence } = res.locals
    const data = { decision: getCurfewAddressChoice(getIn(licence, ['licence'])) }
    const viewData = { data, errorObject: {}, bookingId }

    return res.render('proposedAddress/curfewAddressChoice', viewData)
  }

  router.post(
    '/curfewAddressChoice/:bookingId',
    audited,
    asyncMiddleware(async (req, res) => {
      const { bookingId } = req.params
      const { decision } = req.body
      const { licence } = res.locals

      const bassReferral = getBassReferralContent(decision, licence)

      const proposedAddress = getIn(licence, ['licence', 'proposedAddress'])
      const newProposedAddress = mergeWithRight(proposedAddress, proposedAddressContents[decision])

      await Promise.all([
        licenceService.updateSection('proposedAddress', bookingId, newProposedAddress),
        licenceService.updateSection('bassReferral', bookingId, bassReferral),
      ])

      if (pushToNomis && decision === 'OptOut') {
        await nomisPushService.pushStatus({
          bookingId,
          data: { type: 'optOut', status: 'Yes' },
          username: req.user.username,
        })
      }

      const nextPath = formConfig.curfewAddressChoice.nextPath[decision] || `/hdc/taskList/`

      return res.redirect(`${nextPath}${bookingId}`)
    })
  )

  router.post(
    '/rejected/:bookingId',
    audited,
    asyncMiddleware(async (req, res) => {
      const { enterAlternative, bookingId } = req.body
      const { licence } = res.locals.licence

      const validationErrors =
        licenceService.validateForm({
          formResponse: req.body,
          pageConfig: formConfig.rejected,
        }) || {}

      const errorObject = omit(['_csrf', 'bookingId'], validationErrors)

      if (!isEmpty(errorObject)) {
        req.flash('errors', errorObject)
        return res.redirect(`/hdc/proposedAddress/rejected/${bookingId}`)
      }

      if (enterAlternative === 'Yes') {
        await licenceService.rejectProposedAddress(licence, bookingId)
      }

      const nextPath = formConfig.rejected.nextPath.decisions[enterAlternative]
      return res.redirect(`${nextPath}${bookingId}`)
    })
  )

  router.get('/:formName/:action/:bookingId', asyncMiddleware(standard.get))
  router.get('/:formName/:bookingId', asyncMiddleware(standard.get))
  router.post('/:formName/:action/:bookingId', audited, asyncMiddleware(standard.post))
  router.post('/:formName/:bookingId', audited, asyncMiddleware(standard.post))

  return router
}

function getCurfewAddressChoice(licence) {
  if (isYes(licence, ['proposedAddress', 'optOut', 'decision'])) {
    return 'OptOut'
  }

  if (isYes(licence, ['proposedAddress', 'addressProposed', 'decision'])) {
    return 'Address'
  }

  if (isYes(licence, ['bassReferral', 'bassRequest', 'bassRequested'])) {
    return 'Bass'
  }

  return null
}

function getBassReferralContent(decision, licence) {
  const bassReferral = getIn(licence, ['licence', 'bassReferral'])
  const bassRequest = getIn(bassReferral, ['bassRequest'])
  const bassAnswer = decision === 'Bass' ? 'Yes' : 'No'

  return { ...bassReferral, bassRequest: { ...bassRequest, bassRequested: bassAnswer } }
}

const proposedAddressContents = {
  OptOut: { optOut: { decision: 'Yes' }, addressProposed: { decision: 'No' } },
  Address: { optOut: { decision: 'No' }, addressProposed: { decision: 'Yes' } },
  Bass: { optOut: { decision: 'No' }, addressProposed: { decision: 'No' } },
}
