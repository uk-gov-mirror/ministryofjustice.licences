const superagent = require('superagent')
const config = require('../config')
const versionInfo = require('../utils/versionInfo')
const { getIn } = require('../utils/functionalHelpers')

const pdfGenPath = `${config.pdf.licences.pdfServiceHost}/generate`

module.exports = function createPdfService(logger, licenceService, conditionsService, prisonerService, pdfFormatter) {
  async function getPdfLicenceData(templateName, bookingId, rawLicence, token, postRelease) {
    const versionedLicence = await checkAndUpdateVersion(rawLicence, bookingId, templateName, postRelease)

    const [licence, prisonerInfo, establishment] = await Promise.all([
      conditionsService.populateLicenceWithConditions(versionedLicence.licence),
      prisonerService.getPrisonerDetails(bookingId, token),
      prisonerService.getEstablishmentForPrisoner(bookingId, token),
    ])

    const image = prisonerInfo.facialImageId ? await getImage(prisonerInfo.facialImageId, token) : null

    return pdfFormatter.formatPdfData(
      templateName,
      {
        licence,
        prisonerInfo,
        establishment,
      },
      image,
      { ...rawLicence.approvedVersionDetails, approvedVersion: rawLicence.approvedVersion }
    )
  }

  async function getPdfLicenceDataAndUpdateLicenceType(
    templateName,
    offenceBeforeCutoff,
    bookingId,
    rawLicence,
    token,
    postRelease
  ) {
    const versionedLicence = await updateLicenceTypeTemplate(
      rawLicence,
      bookingId,
      templateName,
      offenceBeforeCutoff,
      postRelease
    )

    const [licence, prisonerInfo, establishment] = await Promise.all([
      conditionsService.populateLicenceWithConditions(versionedLicence.licence),
      prisonerService.getPrisonerDetails(bookingId, token),
      prisonerService.getEstablishmentForPrisoner(bookingId, token),
    ])

    const image = prisonerInfo.facialImageId ? await getImage(prisonerInfo.facialImageId, token) : null

    return pdfFormatter.formatPdfData(templateName, { licence, prisonerInfo, establishment }, image, {
      ...rawLicence.approvedVersionDetails,
      approvedVersion: rawLicence.approvedVersion,
    })
  }

  async function updateLicenceTypeTemplate(rawLicence, bookingId, template, offenceCommittedBeforeCutoff, postRelease) {
    const decision = getIn(rawLicence, ['licence', 'document', 'template', 'decision'])
    const offenceCommittedBeforeFeb2015 = getIn(rawLicence, [
      'licence',
      'document',
      'template',
      'offenceCommittedBeforeFeb2015',
    ])

    if (template === decision && offenceCommittedBeforeCutoff === offenceCommittedBeforeFeb2015) {
      return rawLicence
    }

    await licenceService.update({
      bookingId,
      originalLicence: rawLicence,
      config: { fields: [{ decision: {} }, { offenceCommittedBeforeFeb2015: {} }], noModify: true },
      userInput: { decision: template, offenceCommittedBeforeFeb2015: offenceCommittedBeforeCutoff },
      licenceSection: 'document',
      formName: 'template',
      postRelease,
    })

    await licenceService.saveApprovedLicenceVersion(bookingId, template)
    return licenceService.getLicence(bookingId)
  }

  async function updateOffenceCommittedBefore(
    rawLicence,
    bookingId,
    offenceCommittedBeforeCutoffDecision,
    templateId,
    postRelease
  ) {
    const offenceCommittedBeforeFeb2015 = getIn(rawLicence, [
      'licence',
      'document',
      'template',
      'offenceCommittedBeforeFeb2015',
    ])
    const currentTemplateId = getIn(rawLicence, ['licence', 'document', 'template', 'decision'])

    if (offenceCommittedBeforeCutoffDecision === offenceCommittedBeforeFeb2015 && templateId === currentTemplateId) {
      return rawLicence
    }

    await licenceService.update({
      bookingId,
      originalLicence: rawLicence,
      config: { fields: [{ decision: {} }, { offenceCommittedBeforeFeb2015: {} }], noModify: true },
      userInput: { decision: templateId, offenceCommittedBeforeFeb2015: offenceCommittedBeforeCutoffDecision },
      licenceSection: 'document',
      formName: 'template',
      postRelease,
    })

    return licenceService.getLicence(bookingId)
  }

  async function getImage(facialImageId, token) {
    try {
      return await prisonerService.getPrisonerImage(facialImageId, token)
    } catch (error) {
      logger.error('Error during getPrisonerImage: ', error.stack)
      return null
    }
  }

  // todo - when all licence types migrated, remove this
  async function getPdf(templateName, values) {
    logger.info(`Creating PDF at URI '${pdfGenPath}' for template '${templateName}'`)

    try {
      const result = await superagent.post(pdfGenPath).send({
        templateName,
        values,
      })
      return Buffer.from(result.body)
    } catch (error) {
      logger.error('Error during generate PDF: ', error.stack)
      throw error
    }
  }

  // todo - when all licence types migrated, remove this
  async function generatePdf(templateName, bookingId, rawLicence, token, postRelease) {
    const { values } = await getPdfLicenceData(templateName, bookingId, rawLicence, token, postRelease)
    const qualifiedTemplateName = `${postRelease ? 'vary_' : ''}${templateName}`

    return getPdf(qualifiedTemplateName, values)
  }

  async function checkAndUpdateVersion(rawLicence, bookingId, template, postRelease) {
    const { isNewTemplate, isNewVersion } = versionInfo(rawLicence, template)

    if (isNewTemplate) {
      await licenceService.update({
        bookingId,
        originalLicence: rawLicence,
        config: { fields: [{ decision: {} }], noModify: true },
        userInput: { decision: template },
        licenceSection: 'document',
        formName: 'template',
        postRelease,
      })
    }

    if (isNewVersion || isNewTemplate) {
      await licenceService.saveApprovedLicenceVersion(bookingId, template)
      return licenceService.getLicence(bookingId)
    }

    return rawLicence
  }

  return {
    updateOffenceCommittedBefore,
    getPdfLicenceDataAndUpdateLicenceType,
    getPdfLicenceData,
    getPdf,
    generatePdf,
  }
}
