const logger = require('../../log.js')
const { isEmpty, getIn } = require('../utils/functionalHelpers')

module.exports = function createCaseListService(nomisClientBuilder, licenceClient, caseListFormatter) {
  async function getHdcCaseList(token, username, role, tab = 'active') {
    try {
      const nomisClient = nomisClientBuilder(token)
      const hdcEligibleReleases = await getCaseList(nomisClient, licenceClient, username, role)

      if (isEmpty(hdcEligibleReleases)) {
        logger.info('No hdc eligible prisoners')
        return []
      }

      const formattedCaseList = await caseListFormatter.formatCaseList(hdcEligibleReleases, role)
      return formattedCaseList.filter(
        prisoner => neededForRole(prisoner, role) && prisoner.activeCase === (tab === 'active')
      )
    } catch (error) {
      logger.error('Error during getHdcCaseList: ', error.stack)
      throw error
    }
  }

  return { getHdcCaseList }
}

async function getCaseList(nomisClient, licenceClient, username, role) {
  const asyncCaseRetrievalMethod = {
    CA: nomisClient.getHdcEligiblePrisoners,
    RO: getROCaseList(nomisClient, licenceClient, username),
    DM: nomisClient.getHdcEligiblePrisoners,
  }

  return asyncCaseRetrievalMethod[role]()
}

function getROCaseList(nomisClient, licenceClient, username) {
  return async () => {
    const deliusUserName = await licenceClient.getDeliusUserName(username)

    if (!deliusUserName) {
      logger.warn(`No delius user ID for nomis ID '${username}'`)
      return []
    }

    const requiredPrisoners = await nomisClient.getROPrisoners(deliusUserName)

    if (!isEmpty(requiredPrisoners)) {
      const requiredIDs = requiredPrisoners.map(prisoner => prisoner.bookingId)
      const offenders = await nomisClient.getOffenderSentencesByBookingId(requiredIDs)
      return offenders.filter(prisoner => getIn(prisoner, ['sentenceDetail', 'homeDetentionCurfewEligibilityDate']))
    }

    return []
  }
}

function neededForRole(prisoner, role) {
  const interestedStatuses = {
    RO: [
      { stage: 'PROCESSING_RO' },
      { stage: 'PROCESSING_CA' },
      { stage: 'APPROVAL' },
      { stage: 'DECIDED' },
      { stage: 'MODIFIED' },
      { stage: 'MODIFIED_APPROVAL' },
    ],
    DM: [{ stage: 'APPROVAL' }, { stage: 'DECIDED' }, { stage: 'PROCESSING_CA', status: 'Postponed' }],
  }

  if (!interestedStatuses[role]) {
    return true
  }

  const includedStage = interestedStatuses[role].find(config => prisoner.stage === config.stage)

  if (!includedStage) {
    return false
  }

  if (includedStage.status) {
    return includedStage.status === prisoner.status
  }

  return true
}
