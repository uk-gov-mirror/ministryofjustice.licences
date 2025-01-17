/**
 * @template T
 * @typedef {import("../../types/licences").Result<T>} Result
 */
/**
 * @typedef {import("../services/prisonerService").PrisonerService} PrisonerService
 * @typedef {import("../services/roContactDetailsService").RoContactDetailsService} RoContactDetailsService
 * @typedef {import("../../types/licences").ResponsibleOfficerAndContactDetails} ResponsibleOfficerAndContactDetails
 * @typedef {import("../services/notifications/roNotificationSender").RoNotificationSender} RoNotificationSender
 */
const logger = require('../../log.js')
const { isEmpty, unwrapResult } = require('../utils/functionalHelpers')
const { NOTIFICATION_DATA_NOT_FOUND } = require('./serviceErrors')

/**
 * @param {RoContactDetailsService} roContactDetailsService
 * @param {PrisonerService} prisonerService
 * @param {RoNotificationSender} roNotificationSender
 * @param {string[]} activeNotificationTypes
 */
module.exports = function createReminderService(
  roContactDetailsService,
  prisonerService,
  deadlineService,
  roNotificationSender,
  activeNotificationTypes
) {
  async function notifyRoReminders(token) {
    const overdue = await notifyCases(token, () => deadlineService.getOverdue('RO'), 'RO_OVERDUE')
    const due = await notifyCases(token, () => deadlineService.getDueInDays('RO', 0), 'RO_DUE')
    const soon = await notifyCases(token, () => deadlineService.getDueInDays('RO', 2), 'RO_TWO_DAYS')

    return { overdue, due, soon }
  }

  async function notifyCases(token, caseFinderMethod, notificationType) {
    try {
      if (!activeNotificationTypes.includes(notificationType)) {
        logger.info(`notifying is disabled for notification type: ${notificationType}`)
        return 0
      }
      const cases = await caseFinderMethod()
      if (!isEmpty(cases)) {
        await sendReminders(token, cases, notificationType)
      }
      return cases ? cases.length : 0
    } catch (error) {
      logger.error(`Error notifying cases for notification type: ${notificationType}`, error.stack)
      return 0
    }
  }

  async function sendReminder(token, notificationType, bookingId, transitionDate) {
    const [[responsibleOfficer, prison] = [], error] = unwrapResult(await getNotificationData(bookingId, token))

    if (error || isEmpty(prison)) {
      return
    }

    roNotificationSender.sendNotifications({
      responsibleOfficer,
      prison,
      notificationType,
      bookingId,
      sendingUserName: 'NOTIFICATION_SERVICE',
      transitionDate,
    })
  }

  async function sendReminders(token, licences, notificationType) {
    // This is intentionally sequential to avoid timeouts sometimes arising from multiple quick calls to NOMIS API
    await licences.reduce(async (previous, nextLicence) => {
      await previous
      return sendReminder(token, notificationType, nextLicence.booking_id, nextLicence.transition_date)
    }, Promise.resolve())
  }

  /**
   * @typedef {[ResponsibleOfficerAndContactDetails, string]} NotificationData
   *
   * @param {number} bookingId
   * @param {string} token
   * @returns {Promise<Result<NotificationData>>}
   */
  async function getNotificationData(bookingId, token) {
    try {
      /** @type {[{premise: string}, Result<ResponsibleOfficerAndContactDetails>]} */
      const [establishment, roResult] = await Promise.all([
        prisonerService.getEstablishmentForPrisoner(bookingId, token),
        roContactDetailsService.getResponsibleOfficerWithContactDetails(bookingId, token),
      ])

      const [roWithContactDetails, error] = unwrapResult(roResult)
      if (error) {
        logger.error(`Error loading data for reminder: ${error.message}`)
        return error
      }

      const { premise: prison } = establishment || {}
      return [roWithContactDetails, prison]
    } catch (error) {
      logger.error('Error loading data for reminder', error.stack)
      return { code: NOTIFICATION_DATA_NOT_FOUND, message: `Error loading data for reminder: ${error.message}` }
    }
  }

  return { notifyRoReminders }
}
