const { tasklist, namedTask } = require('./tasklistBuilder')
const { postponeOrRefuse } = require('./tasks/postponement')
const bassAddress = require('./tasks/bassAddress')
const curfewAddress = require('./tasks/ca/curfewAddress')
const riskManagement = require('./tasks/riskManagement')
const victimLiaison = require('./tasks/victimLiaison')
const curfewHours = require('./tasks/curfewHours')
const additionalConditions = require('./tasks/additionalConditions')
const reportingInstructions = require('./tasks/reportingInstructions')
const proposedAddress = require('./tasks/proposedAddress')
const submitAddressReview = require('./tasks/ca/submitAddressReview')
const submitBassReview = require('./tasks/ca/submitBassReview')
const submitToDm = require('./tasks/ca/submitToDm')
const refuseHdc = require('./tasks/ca/refuseHdc')
const informOffenderTask = require('./tasks/ca/informOffenderTask')
const createLicence = require('./tasks/createLicence')
const finalChecks = require('./tasks/finalChecks')
const resubmitToDm = require('./tasks/ca/resubmitToDm')

const caBlocked = (errorCode) => () => ({ task: 'caBlockedTask', errorCode })
const eligibilityTask = namedTask('eligibilityTask')
const eligibilitySummaryTask = namedTask('eligibilitySummaryTask')

module.exports = {
  getTasksForBlocked: (errorCode) => tasklist({}, [[eligibilityTask], [informOffenderTask], [caBlocked(errorCode)]]),

  getCaTasksEligibility: ({ decisions, tasks, allowedTransition }) => {
    const { optedOut, eligible, bassReferralNeeded, addressUnsuitable } = decisions
    const { eligibility, optOut } = tasks

    const eligibilityDone = eligibility === 'DONE'
    const optOutUnstarted = optOut === 'UNSTARTED'
    const optOutRefused = optOut === 'DONE' && !optedOut

    const context = { decisions, tasks, allowedTransition }

    return tasklist(context, [
      [eligibilityTask],
      [informOffenderTask, eligibilityDone && optOutUnstarted && !optedOut],
      [curfewAddress, eligible],
      [riskManagement.edit, addressUnsuitable],
      [submitToDm.refusal, allowedTransition === 'caToDmRefusal'],
      [submitBassReview, optOutRefused && bassReferralNeeded && allowedTransition !== 'caToDmRefusal'],
      [submitAddressReview, optOutRefused && !bassReferralNeeded && allowedTransition !== 'caToDmRefusal'],
    ])
  },

  getCaTasksFinalChecks: ({ decisions, tasks, allowedTransition }) => {
    const {
      addressUnsuitable,
      approvedPremisesRequired,
      bassAccepted,
      bassReferralNeeded,
      bassWithdrawn,
      curfewAddressApproved,
      optedOut,
      eligible,
    } = decisions

    const { bassAreaCheck } = tasks
    const bassAreaChecked = bassAreaCheck === 'DONE'
    const bassExcluded = ['Unavailable', 'Unsuitable'].includes(bassAccepted)
    const bassChecksDone = bassReferralNeeded && bassAreaChecked && !bassWithdrawn && !bassExcluded

    const validAddress = approvedPremisesRequired || curfewAddressApproved || bassChecksDone
    const context = { decisions, tasks, allowedTransition }

    if (optedOut) {
      return tasklist(context, [
        [proposedAddress.ca.processing, !bassReferralNeeded && allowedTransition !== 'caToRo'],
        [curfewAddress, !bassReferralNeeded && allowedTransition === 'caToRo'],
        [bassAddress.ca.postApproval, bassReferralNeeded],
        [refuseHdc],
      ])
    }

    if (!eligible) {
      return tasklist(context, [[eligibilityTask], [informOffenderTask]])
    }

    const showRiskManagement =
      (!approvedPremisesRequired && curfewAddressApproved) ||
      addressUnsuitable ||
      (bassChecksDone && !approvedPremisesRequired)

    return tasklist(context, [
      [eligibilityTask],
      [proposedAddress.ca.processing, !bassReferralNeeded && allowedTransition !== 'caToRo'],
      [curfewAddress, !bassReferralNeeded && allowedTransition === 'caToRo'],
      [bassAddress.ca.postApproval, bassReferralNeeded],
      [riskManagement.edit, showRiskManagement],
      [victimLiaison.edit, validAddress],
      [curfewHours.edit, validAddress],
      [additionalConditions.edit, validAddress],
      [reportingInstructions.edit, validAddress],
      [finalChecks.review, validAddress],
      [postponeOrRefuse, validAddress],
      [refuseHdc],
      [submitToDm.approval, allowedTransition !== 'caToDmRefusal' && allowedTransition !== 'caToRo'],
      [submitToDm.refusal, allowedTransition === 'caToDmRefusal'],
      [submitAddressReview, !bassReferralNeeded && allowedTransition === 'caToRo'],
      [submitBassReview, bassReferralNeeded && allowedTransition === 'caToRo'],
    ])
  },

  getCaTasksPostApproval: (stage) => ({ decisions, tasks, allowedTransition }) => {
    const {
      addressUnsuitable,
      approvedPremisesRequired,
      bassAccepted,
      bassReferralNeeded,
      bassWithdrawn,
      curfewAddressApproved,
      dmRefused,
      eligible,
      postponed,
    } = decisions

    const { bassOffer } = tasks

    const bassExcluded = ['Unavailable', 'Unsuitable'].includes(bassAccepted)
    const bassOfferMade = bassReferralNeeded && bassOffer === 'DONE' && !bassWithdrawn && !bassExcluded

    const validAddress = approvedPremisesRequired || curfewAddressApproved || bassOfferMade

    const context = { decisions, tasks, stage, allowedTransition }

    if (!eligible) {
      return tasklist(context, [[eligibilitySummaryTask, validAddress], [informOffenderTask]])
    }

    return tasklist(context, [
      [eligibilitySummaryTask, validAddress],
      [curfewAddress, allowedTransition === 'caToRo'],
      [bassAddress.ca.standard, bassReferralNeeded && allowedTransition !== 'caToRo'],
      [proposedAddress.ca.postApproval, !bassReferralNeeded && allowedTransition !== 'caToRo'],
      [riskManagement.edit, !approvedPremisesRequired && (curfewAddressApproved || bassOfferMade || addressUnsuitable)],
      [victimLiaison.edit, validAddress],
      [curfewHours.edit, validAddress],
      [additionalConditions.edit, validAddress],
      [reportingInstructions.edit, validAddress],
      [finalChecks.review, validAddress],
      [postponeOrRefuse, validAddress && !dmRefused],
      [refuseHdc, !dmRefused],
      [submitToDm.approval, allowedTransition === 'caToDm'],
      [submitToDm.refusal, allowedTransition === 'caToDmRefusal'],
      [submitBassReview, allowedTransition === 'caToRo'],
      [submitAddressReview, !bassReferralNeeded && allowedTransition === 'caToRo'],
      [resubmitToDm, !['caToDm', 'caToDmRefusal', 'caToRo'].includes(allowedTransition) && dmRefused !== undefined],
      [
        createLicence.ca,
        validAddress && !['caToDm', 'caToDmRefusal', 'caToRo'].includes(allowedTransition) && !dmRefused && !postponed,
      ],
    ])
  },
}
