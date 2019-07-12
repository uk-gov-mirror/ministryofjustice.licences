const moment = require('moment')
const logger = require('../../log.js')
const { asyncMiddleware } = require('../utils/middleware')
const {
  pdf: {
    forms: { formTemplates, formsDateFormat, pdfOptions },
  },
  domain,
} = require('../config')
const { curfewAddressCheckFormFileName } = require('./utils/pdfUtils')
const { isEmpty, getIn } = require('../utils/functionalHelpers')

module.exports = ({ formService }) => router => {
  router.get(
    '/curfewAddress/:bookingId',
    asyncMiddleware(async (req, res) => {
      const { bookingId } = req.params
      const {
        prisoner,
        licence: { licence },
        licenceStatus,
      } = res.locals

      const isBass = getIn(licenceStatus, ['decisions', 'bassReferralNeeded']) === true
      const isAp = getIn(licenceStatus, ['decisions', 'approvedPremisesRequired']) === true

      const pageData = await formService.getCurfewAddressCheckData({
        agencyLocationId: prisoner.agencyLocationId,
        licence,
        isBass,
        isAp,
        bookingId,
        token: res.locals.token,
      })

      const completionDate = moment().format(formsDateFormat)
      const filename = curfewAddressCheckFormFileName(prisoner)

      return res.renderPDF('forms/curfewAddress', { ...pageData, domain, completionDate }, { filename, pdfOptions })
    })
  )

  router.get(
    '/:templateName/:bookingId',
    asyncMiddleware(async (req, res) => {
      const { templateName } = req.params
      const {
        licence: { licence },
        prisoner,
      } = res.locals

      if (isEmpty(formTemplates[templateName])) {
        throw new Error(`unknown form template: ${templateName}`)
      }

      logger.info(`Render PDF for form '${templateName}'`)

      try {
        const pageData = await formService.getTemplateData(templateName, licence, prisoner)
        const filename = `${prisoner.offenderNo}.pdf`
        const pdf = res.renderPDF(`forms/${templateName}`, { ...pageData, domain }, { filename, pdfOptions })
        logger.info(`Returning rendered PDF for form '${templateName}'`)
        return pdf
      } catch (e) {
        logger.warn(`Caught an exception while rendering form ${templateName}: ${e}`)
      }
    })
  )

  router.get(
    '/:bookingId',
    asyncMiddleware(async (req, res) => {
      const { bookingId } = req.params
      return res.render('forms/all', { bookingId, forms: Object.entries(formTemplates) })
    })
  )

  return router
}
