/**
 * @template T
 * @typedef {import("../../types/licences").Result<T>} Result
 */
/**
 * @typedef {import("../../types/licences").Error} Error
 * @typedef {import("../../types/licences").CaService} CaService
 * @typedef {import("./roService").RoService} RoService
 *  @typedef {import("../data/activeLduClient")} ActiveLduClient
 */

const logger = require('../../log.js')
const { unwrapResult } = require('../utils/functionalHelpers')
const { NO_OFFENDER_NUMBER, LDU_INACTIVE, NO_COM_ASSIGNED, COM_NOT_ALLOCATED } = require('./serviceErrors')

/**
 * @param {RoService} roService
 * @param {ActiveLduClient} activeLduClient
 * @returns {CaService} caService
 */
module.exports = function createCaService(roService, activeLduClient) {
  return {
    async getReasonForNotContinuing(bookingId, token) {
      const [ro, error] = unwrapResult(await roService.findResponsibleOfficer(bookingId, token))

      if (error) {
        logger.info(
          `Found reason for not continuing processing booking: ${bookingId}, error: ${error.code}:${error.message}`
        )
        switch (error.code) {
          case NO_OFFENDER_NUMBER:
            return NO_OFFENDER_NUMBER
          case NO_COM_ASSIGNED:
            // Handle NO_COM_ASSIGNED and COM_NOT_ALLOCATED in the same way
            return COM_NOT_ALLOCATED
          default:
            throw new Error(`Unexpected error received: ${error.code}: ${error.message}`)
        }
      }

      const { deliusId, lduCode, isAllocated, probationAreaCode } = ro

      const isLduActive = await activeLduClient.isLduPresent(lduCode, probationAreaCode)

      if (!isLduActive) {
        logger.info(
          `Blocking case for booking: '${bookingId}', as Ldu: '${lduCode}' in Probation Area: '${probationAreaCode}' is not currently active`
        )
        return LDU_INACTIVE
      }

      if (!isAllocated) {
        logger.info(`Blocking case for booking: '${bookingId}' as staff: '${deliusId}' is not allocated`)
        return COM_NOT_ALLOCATED
      }

      return null
    },
  }
}
