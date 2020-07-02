import moment from 'moment'
import logger from '../../log'
import { licenceStage, transitions } from './config/licenceStage'
import recordList from './utils/recordList'
import formValidation from './utils/formValidation'
import { LicenceClient } from '../data/licenceClient'
import { ApprovedLicenceVersion, CaseWithVaryVersion } from '../data/licenceClientTypes'
import { Licence } from '../data/licenceTypes'

const {
  getIn,
  isEmpty,
  notAllValuesEmpty,
  allValuesEmpty,
  equals,
  firstKey,
  removePath,
  removePaths,
  addPaths,
  pickBy,
  replacePath,
  mergeWithRight,
  pick,
  getFieldName,
} = require('../utils/functionalHelpers')

interface ApprovedVersionDetails {
  version?: number
  vary_version?: number
}

export interface LicenceRecord {
  licence: Licence
  stage: string
  version: string
  versionDetails: { version: number; vary_version: number }
  approvedVersion: string
  approvedVersionDetails: ApprovedVersionDetails
}

export class LicenceService {
  private readonly licenceClient: LicenceClient

  constructor(licenceClient: LicenceClient) {
    this.licenceClient = licenceClient
  }

  async reset() {
    try {
      await this.licenceClient.deleteAll()
    } catch (error) {
      logger.error('Error during reset licences', error.stack)
      throw error
    }
  }

  async getLicence(bookingId: number): Promise<LicenceRecord> {
    try {
      const [rawLicence, rawVersionDetails] = await Promise.all<CaseWithVaryVersion, ApprovedLicenceVersion>([
        this.licenceClient.getLicence(bookingId),
        this.licenceClient.getApprovedLicenceVersion(bookingId),
      ])

      if (!rawLicence) {
        return null
      }

      const { licence, stage } = rawLicence
      if (!licence) {
        return null
      }

      const approvedVersionDetails: ApprovedVersionDetails = rawVersionDetails || {}
      const version = `${rawLicence.version}.${rawLicence.vary_version}`
      const versionDetails = { version: rawLicence.version, vary_version: rawLicence.vary_version }
      const approvedVersion = isEmpty(approvedVersionDetails)
        ? ''
        : `${approvedVersionDetails.version}.${approvedVersionDetails.vary_version}`

      return {
        licence,
        stage,
        version,
        versionDetails,
        approvedVersion,
        approvedVersionDetails,
      }
    } catch (error) {
      logger.error('Error during getLicence', error.stack)
      throw error
    }
  }

  createLicence({ bookingId, data = {}, stage = null }: { bookingId: number; data?: Licence; stage?: string }) {
    const varyVersion = stage === 'VARY' ? 1 : 0
    return this.licenceClient.createLicence(bookingId, data, licenceStage[stage], 1, varyVersion)
  }

  async updateLicenceConditions(bookingId, existingLicence, newConditionsObject, postRelease = false) {
    try {
      const existingLicenceConditions = getIn(existingLicence, ['licence', 'licenceConditions'])
      const licenceConditions = { ...existingLicenceConditions, ...newConditionsObject }

      if (equals(existingLicenceConditions, licenceConditions)) {
        return null
      }

      await this.updateModificationStage(bookingId, existingLicence.stage, { requiresApproval: true })

      return this.licenceClient.updateSection('licenceConditions', bookingId, licenceConditions, postRelease)
    } catch (error) {
      logger.error('Error during updateAdditionalConditions', error.stack)
      throw error
    }
  }

  async deleteLicenceCondition(bookingId, existingLicence, conditionId) {
    try {
      const existingLicenceConditions = getIn(existingLicence, ['licence', 'licenceConditions'])

      const newConditions = this.removeCondition(existingLicenceConditions, conditionId)

      return this.licenceClient.updateSection('licenceConditions', bookingId, newConditions)
    } catch (error) {
      logger.error('Error during updateAdditionalConditions', error.stack)
      throw error
    }
  }

  private removeCondition(oldConditions, idToRemove) {
    if (idToRemove.startsWith('bespoke')) {
      return this.removeBespokeCondition(oldConditions, idToRemove)
    }

    return this.removeAdditionalCondition(oldConditions, idToRemove)
  }

  private removeAdditionalCondition(oldConditions, idToRemove) {
    const { [idToRemove]: conditionToRemove, ...theRest } = oldConditions.additional
    logger.debug(`Deleted condition: ${conditionToRemove}`)

    return { ...oldConditions, additional: theRest }
  }

  private removeBespokeCondition(oldConditions, idToRemove) {
    const indexToRemove = idToRemove.substr(idToRemove.indexOf('-') + 1)

    if (indexToRemove >= oldConditions.bespoke.length) {
      return oldConditions
    }

    const elementToRemove = oldConditions.bespoke[indexToRemove]

    const theRest = oldConditions.bespoke.filter((e) => e !== elementToRemove)

    return { ...oldConditions, bespoke: theRest }
  }

  markForHandover(bookingId, transitionType) {
    const newStage = getIn(transitions, [transitionType])

    if (!newStage) {
      throw new Error(`Invalid handover transition: ${transitionType}`)
    }

    return this.licenceClient.updateStage(bookingId, newStage)
  }

  updateModificationStage(bookingId, stage, { requiresApproval, noModify = false }) {
    if (noModify) {
      return null
    }

    if (requiresApproval && (stage === 'DECIDED' || stage === 'MODIFIED')) {
      return this.licenceClient.updateStage(bookingId, licenceStage.MODIFIED_APPROVAL)
    }

    if (stage === 'DECIDED') {
      return this.licenceClient.updateStage(bookingId, licenceStage.MODIFIED)
    }
    return null
  }

  private getFormResponse = (fieldMap, userInput) => fieldMap.reduce(this.answersFromMapReducer(userInput), {})

  async update({ bookingId, originalLicence, config, userInput, licenceSection, formName, postRelease = false }) {
    const stage = getIn(originalLicence, ['stage'])
    const licence = getIn(originalLicence, ['licence'])

    if (!licence) {
      return null
    }

    const updatedLicence = this.getUpdatedLicence({
      licence,
      fieldMap: config.fields,
      userInput,
      licenceSection,
      formName,
    })

    if (equals(licence, updatedLicence)) {
      return licence
    }

    await this.licenceClient.updateLicence(bookingId, updatedLicence, postRelease)

    await this.updateModificationStage(bookingId, stage, {
      requiresApproval: config.modificationRequiresApproval,
      noModify: config.noModify,
    })

    return updatedLicence
  }

  getUpdatedLicence({ licence, fieldMap, userInput, licenceSection, formName }) {
    const answers = this.getFormResponse(fieldMap, userInput)

    return {
      ...licence,
      [licenceSection]: {
        ...licence[licenceSection],
        [formName]: answers,
      },
    }
  }

  private answersFromMapReducer(userInput) {
    return (answersAccumulator, field) => {
      const { fieldName, answerIsRequired, innerFields, inputIsList, inputIsSplitDate } = this.getFieldInfo(
        field,
        userInput
      )

      if (!answerIsRequired) {
        return answersAccumulator
      }

      if (inputIsList) {
        const arrayOfInputs = userInput[fieldName]
          .map((item) => this.getFormResponse(field[fieldName].contains, item))
          .filter(notAllValuesEmpty)

        return { ...answersAccumulator, [fieldName]: arrayOfInputs }
      }

      if (!isEmpty(innerFields)) {
        const innerFieldMap = field[fieldName].contains
        const innerAnswers = this.getFormResponse(innerFieldMap, userInput[fieldName])

        if (allValuesEmpty(innerAnswers)) {
          return answersAccumulator
        }

        return { ...answersAccumulator, [fieldName]: innerAnswers }
      }

      if (inputIsSplitDate) {
        return { ...answersAccumulator, [fieldName]: this.getCombinedDate(field[fieldName], userInput) }
      }

      return { ...answersAccumulator, [fieldName]: userInput[fieldName] }
    }
  }

  private getCombinedDate(dateConfig, userInput) {
    const { day, month, year } = dateConfig.splitDate

    if ([day, month, year].every((item) => userInput[item].length === 0)) return ''

    return `${userInput[day]}/${userInput[month]}/${userInput[year]}`
  }

  addSplitDateFields(rawData, formFieldsConfig) {
    return formFieldsConfig.reduce((data, field) => {
      const fieldKey = firstKey(field)
      const fieldConfig = field[fieldKey]
      const splitDateConfig = getIn(fieldConfig, ['splitDate'])

      if (!rawData[fieldKey] || !splitDateConfig) {
        return data
      }

      const date = moment(rawData[fieldKey], 'DD/MM/YYYY')
      if (!date.isValid()) {
        return data
      }

      return {
        ...data,
        [splitDateConfig.day]: date.format('DD'),
        [splitDateConfig.month]: date.format('MM'),
        [splitDateConfig.year]: date.format('YYYY'),
      }
    }, rawData)
  }

  private getFieldInfo(field, userInput) {
    const fieldName = Object.keys(field)[0]
    const fieldConfig = field[fieldName]

    const fieldDependentOn = userInput[fieldConfig.dependentOn]
    const predicateResponse = fieldConfig.predicate
    const dependentMatchesPredicate = fieldConfig.dependentOn && fieldDependentOn === predicateResponse
    const inputIsSplitDate = fieldConfig.splitDate

    return {
      fieldName,
      answerIsRequired: !fieldDependentOn || dependentMatchesPredicate,
      innerFields: field[fieldName].contains,
      inputIsList: fieldConfig.isList,
      fieldConfig,
      inputIsSplitDate,
    }
  }

  async removeDecision(bookingId, rawLicence) {
    const { licence } = rawLicence
    const updatedLicence = removePath(['approval'], licence)

    await this.licenceClient.updateLicence(bookingId, updatedLicence)
    return updatedLicence
  }

  rejectBass(licence, bookingId, bassRequested, reason) {
    const lastBassReferral = getIn(licence, ['bassReferral'])

    if (!lastBassReferral) {
      return licence
    }

    const oldRecord = mergeWithRight(lastBassReferral, { rejectionReason: reason })
    const newRecord = { bassRequest: { bassRequested } }

    return this.deactivateBassEntry(licence, oldRecord, newRecord, bookingId)
  }

  withdrawBass(licence, bookingId, withdrawal) {
    const lastBassReferral = getIn(licence, ['bassReferral'])

    if (!lastBassReferral) {
      return licence
    }

    const oldRecord = mergeWithRight(lastBassReferral, { withdrawal })
    const newRecord = { bassRequest: { bassRequested: 'Yes' } }

    return this.deactivateBassEntry(licence, oldRecord, newRecord, bookingId)
  }

  private deactivateBassEntry(licence, oldRecord, newRecord, bookingId) {
    const bassRejections = recordList({ licence, path: ['bassRejections'], allowEmpty: true })
    const licenceWithBassRejections = bassRejections.add({ record: oldRecord })

    const updatedLicence = replacePath(['bassReferral'], newRecord, licenceWithBassRejections)

    return this.licenceClient.updateLicence(bookingId, updatedLicence)
  }

  reinstateBass(licence, bookingId) {
    const bassRejections = recordList({ licence, path: ['bassRejections'] })

    const entryToReinstate = removePath(['withdrawal'], bassRejections.last())

    const licenceAfterWithdrawalRemoved = bassRejections.remove()

    const updatedLicence = replacePath(['bassReferral'], entryToReinstate, licenceAfterWithdrawalRemoved)

    return this.licenceClient.updateLicence(bookingId, updatedLicence)
  }

  async rejectProposedAddress(licence, bookingId, withdrawalReason) {
    const address = getIn(licence, ['proposedAddress', 'curfewAddress'])
    const curfew = getIn(licence, ['curfew'])
    const addressReview = curfew ? pick(['curfewAddressReview'], curfew) : null
    const riskManagementInputs = getIn(licence, ['risk', 'riskManagement'])
    const riskManagement = riskManagementInputs
      ? pick(['proposedAddressSuitable', 'unsuitableReason'], riskManagementInputs)
      : null

    const addressToStore = pickBy((val) => val, { address, addressReview, riskManagement, withdrawalReason })

    const addressRejections = recordList({ licence, path: ['proposedAddress', 'rejections'], allowEmpty: true })
    const licenceWithAddressRejection = addressRejections.add({ record: addressToStore })

    const updatedLicence = removePaths(
      [
        ['proposedAddress', 'curfewAddress'],
        ['risk', 'riskManagement', 'proposedAddressSuitable'],
        ['risk', 'riskManagement', 'unsuitableReason'],
        ['curfew', 'curfewAddressReview'],
      ],
      licenceWithAddressRejection
    )

    await this.licenceClient.updateLicence(bookingId, updatedLicence)
    return updatedLicence
  }

  async reinstateProposedAddress(licence, bookingId) {
    const addressRejections = recordList({ licence, path: ['proposedAddress', 'rejections'] })
    const licenceAfterRemoval = addressRejections.remove()

    const entryToReinstate = addressRejections.last()
    const curfewAddressReview = getIn(entryToReinstate, ['addressReview', 'curfewAddressReview'])
    const address = getIn(entryToReinstate, ['address'])
    const riskManagement = getIn(entryToReinstate, ['riskManagement'])

    const updatedLicence = addPaths(
      [
        [['proposedAddress', 'curfewAddress'], address],
        [['risk', 'riskManagement', 'proposedAddressSuitable'], getIn(riskManagement, ['proposedAddressSuitable'])],
        [['risk', 'riskManagement', 'unsuitableReason'], getIn(riskManagement, ['unsuitableReason'])],
        [['curfew', 'curfewAddressReview'], curfewAddressReview],
      ].filter((argument) => argument[1]),
      licenceAfterRemoval
    )

    await this.licenceClient.updateLicence(bookingId, updatedLicence)
    return updatedLicence
  }

  validateFormGroup({
    licence,
    stage,
    decisions = {},
    tasks = {},
  }: {
    licence: Licence
    stage: string
    decisions?: any
    tasks?: any
  }) {
    const {
      addressUnsuitable,
      bassAreaNotSuitable,
      bassReferralNeeded,
      addressReviewFailed,
      approvedPremisesRequired,
    } = decisions

    const { curfewAddressReview, bassAreaCheck } = tasks

    const newAddressAddedForReview = stage !== 'PROCESSING_RO' && curfewAddressReview === 'UNSTARTED'
    const newBassAreaAddedForReview = stage !== 'PROCESSING_RO' && bassAreaCheck === 'UNSTARTED'

    const groupName = () => {
      if (stage === 'PROCESSING_RO') {
        if (approvedPremisesRequired) {
          return 'PROCESSING_RO_APPROVED_PREMISES'
        }
        if (addressReviewFailed) {
          return 'PROCESSING_RO_ADDRESS_REVIEW_REJECTED'
        }
        if (addressUnsuitable) {
          return 'PROCESSING_RO_RISK_REJECTED'
        }
        if (bassAreaNotSuitable) {
          return 'BASS_AREA'
        }
        if (bassReferralNeeded) {
          return 'PROCESSING_RO_BASS_REQUESTED'
        }
      }

      if (bassReferralNeeded && (stage === 'ELIGIBILITY' || newBassAreaAddedForReview)) {
        return 'BASS_REQUEST'
      }

      if (newAddressAddedForReview) {
        return 'ELIGIBILITY'
      }

      return stage
    }

    return formValidation.validateGroup({
      licence,
      group: groupName(),
      bespokeConditions: {
        offenderIsMainOccupier: decisions.offenderIsMainOccupier,
      },
    })
  }

  async createLicenceFromFlatInput(input, bookingId, existingLicence, pageConfig, postRelease = false) {
    const inputWithCurfewHours = this.addCurfewHoursInput(input)

    const newLicence = pageConfig.fields.reduce((licence, field) => {
      const fieldName = getFieldName(field)
      const inputPosition = field[fieldName].licencePosition

      if (!inputWithCurfewHours[fieldName]) {
        return licence
      }
      return replacePath(inputPosition, inputWithCurfewHours[fieldName], licence)
    }, existingLicence)

    await this.licenceClient.updateLicence(bookingId, newLicence, postRelease)
    return newLicence
  }

  addCurfewHoursInput(input) {
    if (input.daySpecificInputs === 'Yes') {
      return input
    }

    return Object.keys(input).reduce((builtInput, fieldItem) => {
      if (fieldItem.includes('From')) {
        return { ...builtInput, [fieldItem]: builtInput.allFrom }
      }

      if (fieldItem.includes('Until')) {
        return { ...builtInput, [fieldItem]: builtInput.allUntil }
      }

      return builtInput
    }, input)
  }

  validateForm(params) {
    return formValidation.validate(params)
  }

  updateSection(section, bookingId: number, object, postRelease: boolean = false) {
    return this.licenceClient.updateSection(section, bookingId, object, postRelease)
  }

  saveApprovedLicenceVersion(bookingId, template) {
    return this.licenceClient.saveApprovedLicenceVersion(bookingId, template)
  }
}

export function createLicenceService(licenceClient: LicenceClient) {
  return new LicenceService(licenceClient)
}