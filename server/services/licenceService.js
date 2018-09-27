const logger = require('../../log.js');
const {createAdditionalConditionsObject} = require('../utils/licenceFactory');
const {formatObjectForView} = require('./utils/formatForView');
const {
    getIn,
    isEmpty,
    notAllValuesEmpty,
    allValuesEmpty,
    getFirstArrayItems,
    flatten,
    mergeWithRight,
    removePath,
    equals
} = require('../utils/functionalHelpers');

const {licenceStages, transitions} = require('../models/licenceStages');
const {getConfiscationOrderState} = require('../utils/licenceStatus');
const validate = require('./utils/licenceValidation');
const addressHelpers = require('./utils/addressHelpers');

module.exports = function createLicenceService(licenceClient) {

    async function reset() {
        try {
            await licenceClient.deleteAll();
        } catch (error) {
            logger.error('Error during reset licences', error.stack);
            throw error;
        }
    }

    async function getLicence(bookingId) {
        try {
            const getLicence = licenceClient.getLicence(bookingId);
            const getApprovedVersion = await licenceClient.getApprovedLicenceVersion(bookingId);

            const details = await Promise.all([getLicence, getApprovedVersion]);

            const rawLicence = details[0];
            const versionDetails = details[1];

            const licence = getIn(rawLicence, ['licence']);
            if (!licence) {
                return null;
            }
            const formattedLicence = formatObjectForView(licence);
            const approvedVersion = versionDetails ? formatObjectForView(versionDetails) : undefined;
            const stage = getIn(rawLicence, ['stage']);
            const version = getIn(rawLicence, ['version']);

            return {licence: formattedLicence, stage, version, approvedVersion};

        } catch (error) {
            logger.error('Error during getLicence', error.stack);
            throw error;
        }
    }

    function createLicence(bookingId, data = {}) {
        return licenceClient.createLicence(bookingId, data);
    }

    async function updateLicenceConditions(bookingId, additional = {}, bespoke = []) {
        try {
            const existingLicence = await licenceClient.getLicence(bookingId);
            const existingLicenceConditions = getIn(existingLicence, ['licence', 'licenceConditions']);
            const conditionsObject = await getConditionsObject(additional, bespoke);

            const licenceConditions = {...existingLicenceConditions, ...conditionsObject};

            if (equals(existingLicenceConditions, licenceConditions)) {
                return;
            }

            await updateModificationStage(bookingId, existingLicence.stage, {requiresApproval: true});

            return licenceClient.updateSection('licenceConditions', bookingId, licenceConditions);
        } catch (error) {
            logger.error('Error during updateAdditionalConditions', error.stack);
            throw error;
        }
    }

    async function getConditionsObject(additional, bespoke) {

        if (isEmpty(additional)) {
            return {additional: {}, bespoke};
        }

        const conditionIds = additional.additionalConditions;
        const selectedConditionsConfig = await licenceClient.getAdditionalConditions(conditionIds);
        const additionalConditionsObject = createAdditionalConditionsObject(
            selectedConditionsConfig,
            additional
        );

        return {additional: {...additionalConditionsObject}, bespoke};
    }

    async function deleteLicenceCondition(bookingId, conditionId) {
        try {
            const existingLicence = await licenceClient.getLicence(bookingId);
            const existingLicenceConditions = getIn(existingLicence, ['licence', 'licenceConditions']);

            const newConditions = removeCondition(existingLicenceConditions, conditionId, bookingId);

            return licenceClient.updateSection('licenceConditions', bookingId, newConditions);

        } catch (error) {
            logger.error('Error during updateAdditionalConditions', error.stack);
            throw error;
        }
    }

    function removeCondition(oldConditions, idToRemove) {

        if (idToRemove.startsWith('bespoke')) {
            return removeBespokeCondition(oldConditions, idToRemove);
        }

        return removeAdditionalCondition(oldConditions, idToRemove);
    }

    function removeAdditionalCondition(oldConditions, idToRemove) {

        const {[idToRemove]: conditionToRemove, ...theRest} = oldConditions.additional;
        logger.debug('Deleted condition: ' + conditionToRemove);

        return {...oldConditions, additional: theRest};
    }

    function removeBespokeCondition(oldConditions, idToRemove) {

        const indexToRemove = idToRemove.substr(idToRemove.indexOf('-') + 1);

        if (indexToRemove >= oldConditions.bespoke.length) {
            return oldConditions;
        }

        const elementToRemove = oldConditions.bespoke[indexToRemove];

        const theRest = oldConditions.bespoke.filter(e => e !== elementToRemove);

        return {...oldConditions, bespoke: theRest};
    }

    function markForHandover(bookingId, licence, transitionType) {

        const newStage = getIn(transitions, [transitionType]);

        if (!newStage) {
            throw new Error('Invalid handover transition: ' + transitionType);
        }

        return licenceClient.updateStage(bookingId, newStage);
    }

    function updateModificationStage(bookingId, stage, {requiresApproval, noModify}) {

        if (noModify) {
            return;
        }

        if (requiresApproval && (stage === 'DECIDED' || stage === 'MODIFIED')) {
            return licenceClient.updateStage(bookingId, licenceStages.MODIFIED_APPROVAL);
        }

        if (stage === 'DECIDED') {
            return licenceClient.updateStage(bookingId, licenceStages.MODIFIED);
        }

    }

    const getFormResponse = (fieldMap, userInput) => fieldMap.reduce(answersFromMapReducer(userInput), {});

    async function update({bookingId, config, userInput, licenceSection, formName}) {
        const rawLicence = await licenceClient.getLicence(bookingId);
        const stage = getIn(rawLicence, ['stage']);
        const licence = getIn(rawLicence, ['licence']);

        if (!licence) {
            return null;
        }

        const updatedLicence = getUpdatedLicence({
            licence,
            fieldMap: config.fields,
            userInput,
            licenceSection,
            formName
        });

        if (equals(licence, updatedLicence)) {
            return licence;
        }

        await licenceClient.updateLicence(bookingId, updatedLicence);

        await updateModificationStage(bookingId, stage, {
            requiresApproval: config.modificationRequiresApproval,
            noModify: config.noModify
        });

        return updatedLicence;
    }

    function getUpdatedLicence({licence, fieldMap, userInput, licenceSection, formName}) {

        const answers = getFormResponse(fieldMap, userInput);

        return {...licence, [licenceSection]: {...licence[licenceSection], [formName]: answers}};
    }

    function answersFromMapReducer(userInput) {

        return (answersAccumulator, field) => {
            const {fieldName, answerIsRequired, innerFields, inputIsList, fieldConfig} = getFieldInfo(field, userInput);

            if (!answerIsRequired) {
                return answersAccumulator;
            }

            if (inputIsList) {
                const input = getLimitedInput(fieldConfig, fieldName, userInput);
                const arrayOfInputs = input
                    .map(item => getFormResponse(field[fieldName].contains, item))
                    .filter(notAllValuesEmpty);

                return {...answersAccumulator, [fieldName]: arrayOfInputs};
            }

            if (!isEmpty(innerFields)) {

                const innerFieldMap = field[fieldName].contains;
                const innerAnswers = getFormResponse(innerFieldMap, userInput[fieldName]);

                if (!fieldConfig.saveEmpty && allValuesEmpty(innerAnswers)) {
                    return answersAccumulator;
                }

                return {...answersAccumulator, [fieldName]: innerAnswers};
            }

            return {...answersAccumulator, [fieldName]: userInput[fieldName]};
        };
    }

    function getFieldInfo(field, userInput) {
        const fieldName = Object.keys(field)[0];
        const fieldConfig = field[fieldName];
        const fieldDependentOn = userInput[fieldConfig.dependentOn];
        const predicateResponse = fieldConfig.predicate;
        const dependentMatchesPredicate = fieldConfig.dependentOn && fieldDependentOn === predicateResponse;

        return {
            fieldName,
            answerIsRequired: !fieldDependentOn || dependentMatchesPredicate,
            innerFields: field[fieldName].contains,
            inputIsList: fieldConfig.isList,
            fieldConfig
        };
    }

    function getLimitedInput(fieldConfig, fieldName, userInput) {
        const limitingField = getIn(fieldConfig, ['limitedBy', 'field']);
        const limitingValue = userInput[limitingField];
        const limitTo = getIn(fieldConfig, ['limitedBy', limitingValue]);

        if (limitTo) {
            return getFirstArrayItems(userInput[fieldName], limitTo);
        }

        return userInput[fieldName];
    }

    function updateStage(bookingId, status) {
        return licenceClient.updateStage(bookingId, status);
    }

    const updateAddress = updateAddressArray(addressHelpers.update);
    const addAddress = updateAddressArray(addressHelpers.add);

    function updateAddressArray(addressesUpdateMethod) {
        return async ({bookingId, rawLicence, fieldMap, userInput, index}) => {
            const {stage, licence} = rawLicence;
            const formResponse = getFormResponse(fieldMap, userInput);

            const newAddress = Array.isArray(formResponse.addresses) ? formResponse.addresses[0] : formResponse;
            const updatedLicence = addressesUpdateMethod({bookingId, licence, newAddress, index});

            if (equals(licence, updatedLicence)) {
                return licence;
            }

            await updateModificationStage(bookingId, stage, {requiresApproval: false});

            await licenceClient.updateLicence(bookingId, updatedLicence);

            return updatedLicence;
        };
    }

    function getLicenceErrors({licence, sections}) {

        const licenceSections = sections ||
            ['eligibility', 'proposedAddress', 'curfew', 'risk', 'reporting', 'licenceConditions'];

        const validationErrors = licenceSections.map(validate(licence)).filter(item => item);

        if (isEmpty(validationErrors)) {
            return [];
        }

        return flatten(validationErrors).reduce((errorObject, error) => mergeWithRight(errorObject, error.path), {});
    }

    function getConditionsErrors(licence) {
        return getLicenceErrors({licence, sections: ['licenceConditions']});
    }

    const getValidationErrorsForReview = ({licenceStatus, licence}) => {
        const {stage, decisions, tasks} = licenceStatus;
        const newAddressAddedForReview = stage !== 'PROCESSING_RO' && tasks.curfewAddressReview === 'UNSTARTED';

        if (stage === 'ELIGIBILITY' || newAddressAddedForReview) {
            return getEligibilityErrors({licence});
        }

        if (stage === 'PROCESSING_RO' && decisions.curfewAddressApproved === 'rejected') {
            return getLicenceErrors({licence, sections: ['proposedAddress']});
        }

        return getLicenceErrors({licence});
    };

    function getEligibilityErrors({licence}) {
        const errorObject = getLicenceErrors({licence, sections: ['proposedAddress']});
        const unwantedAddressFields = ['consent', 'electricity', 'homeVisitConducted', 'deemedSafe', 'unsafeReason'];

        if (typeof getIn(errorObject, ['proposedAddress', 'curfewAddress']) === 'string') {
            return errorObject;
        }

        return unwantedAddressFields.reduce(removeFromAddressReducer, errorObject);
    }

    function removeFromAddressReducer(errorObject, addressKey) {
        const newObject = removePath(['proposedAddress', 'curfewAddress', addressKey], errorObject);

        if (isEmpty(getIn(newObject, ['proposedAddress', 'curfewAddress']))) {
            return removePath(['proposedAddress'], newObject);
        }

        return newObject;
    }

    function getValidationErrorsForPage(licence, licenceSectionOfPage) {
        if (licenceSectionOfPage === 'approval') {
            const {confiscationOrder} = getConfiscationOrderState(licence);
            return getApprovalErrors({licence, confiscationOrder});
        }

        return getLicenceErrors({licence, sections: [licenceSectionOfPage]});
    }

    function getApprovalErrors({licence, confiscationOrder}) {
        const errorObject = getLicenceErrors({licence, sections: ['approval']});

        if (confiscationOrder) {
            return errorObject;
        }

        const removeNotedCommentsError = removePath(['approval', 'release', 'notedComments']);
        const errorsWithoutNotedComments = removeNotedCommentsError(errorObject);

        const noErrorsInApproval = isEmpty(getIn(errorsWithoutNotedComments, ['approval', 'release']));
        if (noErrorsInApproval) {
            const removeApprovalError = removePath(['approval']);
            return removeApprovalError(errorsWithoutNotedComments);
        }

        return errorsWithoutNotedComments;
    }

    return {
        reset,
        getLicence,
        createLicence,
        updateLicenceConditions,
        deleteLicenceCondition,
        markForHandover,
        update,
        updateStage,
        updateAddress,
        addAddress,
        getLicenceErrors,
        getConditionsErrors,
        getEligibilityErrors,
        getValidationErrorsForReview,
        getValidationErrorsForPage,
        saveApprovedLicenceVersion: licenceClient.saveApprovedLicenceVersion
    };
};
