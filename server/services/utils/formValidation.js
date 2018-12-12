const baseJoi = require('joi');
const dateExtend = require('joi-date-extensions');
const postcodeExtend = require('joi-postcode');
const {curfewAddressSchema, addressReviewSchema, addressSafetySchema} = require('./bespokeAddressSchema');

const {
    getFieldName,
    getFieldDetail,
    getIn,
    isEmpty,
    mergeWithRight,
    lastItem
} = require('../../utils/functionalHelpers');

const proposedAddressConfig = require('../../routes/config/proposedAddress');
const riskConfig = require('../../routes/config/risk');
const curfewConfig = require('../../routes/config/curfew');
const reportingConfig = require('../../routes/config/reporting');
const bassConfig = require('../../routes/config/bassReferral');

const joi = baseJoi.extend(dateExtend).extend(postcodeExtend);

const fieldOptions = {
    requiredString: joi.string().required(),
    optionalString: joi.string().allow('').optional(),
    requiredYesNo: joi.valid(['Yes', 'No']).required(),
    optionalYesNo: joi.valid(['Yes', 'No']).optional(),
    selection: joi.array().min(1).required(),
    requiredTime: joi.date().format('HH:mm').required(),
    requiredDate: joi.date().format('DD/MM/YYYY').min('now').required(),
    optionalList: joi.array().optional(),
    requiredPostcode: joi.postcode().required(),
    requiredPhone: joi.string().regex(/^[0-9+\s]+$/).required(),
    optionalAge: joi.number().min(0).max(110).allow('').optional(),
    requiredSelectionIf: (requiredItem = 'decision', requiredAnswer = 'Yes') => joi.when(requiredItem, {
        is: requiredAnswer,
        then: joi.array().min(1).required(),
        otherwise: joi.any().optional()
    }),
    requiredYesNoIf: (requiredItem = 'decision', requiredAnswer = 'Yes') => joi.when(requiredItem, {
        is: requiredAnswer,
        then: joi.valid(['Yes', 'No']).required(),
        otherwise: joi.any().optional()
    }),
    requiredStringIf: (requiredItem = 'decision', requiredAnswer = 'Yes') => joi.when(requiredItem, {
        is: requiredAnswer,
        then: joi.string().required(),
        otherwise: joi.any().optional()
    }),
    optionalStringIf: (requiredItem = 'decision', requiredAnswer = 'Yes') => joi.when(requiredItem, {
        is: requiredAnswer,
        then: joi.string().allow('').optional(),
        otherwise: joi.any().optional()
    }),
    requiredPostcodeIf: (requiredItem = 'decision', requiredAnswer = 'Yes') => joi.when(requiredItem, {
        is: requiredAnswer,
        then: joi.postcode().required(),
        otherwise: joi.any().optional()
    }),
    requiredTelephoneIf: (requiredItem = 'decision', requiredAnswer = 'Yes') => joi.when(requiredItem, {
        is: requiredAnswer,
        then: joi.string().regex(/^[0-9+\s]+$/).required(),
        otherwise: joi.any().optional()
    })
};

const validationProcedures = {
    standard: {
        getSchema: createSchemaFromConfig,
        fieldConfigPath: ['fields'],
        getErrorMessage: (fieldConfig, errorPath) => getIn(fieldConfig, [...errorPath, 'validationMessage'])
    },
    curfewAddress: {
        getSchema: () => curfewAddressSchema,
        fieldConfigPath: ['fields', 0, 'addresses', 'contains'],
        getErrorMessage: (fieldConfig, errorPath) => {
            const fieldName = getFieldName(fieldConfig);
            const fieldsWithInnerContents = ['residents', 'occupier'];
            if (!fieldsWithInnerContents.includes(fieldName)) {
                return getIn(fieldConfig, [...errorPath, 'validationMessage']);
            }

            const innerFieldName = lastItem(errorPath);
            const innerFieldConfig = fieldConfig[fieldName].contains.find(item => getFieldName(item) === innerFieldName);
            return innerFieldConfig[innerFieldName].validationMessage;
        }
    },
    curfewAddressReview: {
        getSchema: () => curfewAddressSchema.concat(addressReviewSchema),
        fieldConfigPath: ['fields'],
        getErrorMessage: (fieldConfig, errorPath) => getIn(fieldConfig, [...errorPath, 'validationMessage'])
    },
    addressSafety: {
        getSchema: () => curfewAddressSchema.concat(addressReviewSchema).concat(addressSafetySchema),
        fieldConfigPath: ['fields'],
        getErrorMessage: (fieldConfig, errorPath) => getIn(fieldConfig, [...errorPath, 'validationMessage'])
    }
};

module.exports = {
    validate,
    validateGroup
};

function validate({formResponse, pageConfig, formType = 'standard', bespokeConditions = {}} = {}) {
    const procedure = validationProcedures[formType] || validationProcedures.standard;
    const fieldsConfig = getIn(pageConfig, procedure.fieldConfigPath);
    const formSchema = procedure.getSchema(pageConfig, bespokeConditions);

    const joiErrors = joi.validate(formResponse, formSchema, {stripUnknown: false, abortEarly: false});
    if (!(joiErrors.error)) {
        return {};
    }

    return joiErrors.error.details.reduce((errors, error) => {
        // joi returns map to error in path field
        const fieldConfig = fieldsConfig.find(field => getFieldName(field) === error.path[0]);
        const errorMessage = procedure.getErrorMessage(fieldConfig, error.path) || error.message;

        const errorObject = error.path.reduceRight((errorObj, key) => ({[key]: errorObj}), errorMessage);
        return mergeWithRight(errors, errorObject);
    }, {});
}

function validateGroup({licence, group}) {
    const groups = {
        ELIGIBILITY: [
            {
                formResponse: lastItem(getIn(licence, ['proposedAddress', 'curfewAddress', 'addresses']) || []),
                formType: 'curfewAddress',
                pageConfig: proposedAddressConfig.curfewAddress,
                section: 'proposedAddress',
                missingMessage: 'Please provide a curfew address'
            }
        ],
        PROCESSING_RO: [
            {
                formResponse: lastItem(getIn(licence, ['proposedAddress', 'curfewAddress', 'addresses']) || []),
                formType: 'curfewAddressReview',
                pageConfig: curfewConfig.curfewAddressReview,
                section: 'curfewAddress',
                missingMessage: 'Enter the curfew address review details'
            },
            {
                formResponse: lastItem(getIn(licence, ['proposedAddress', 'curfewAddress', 'addresses']) || []),
                formType: 'addressSafety',
                pageConfig: curfewConfig.addressSafety,
                section: 'curfewAddress',
                missingMessage: 'Enter the curfew address review details'
            },
            {
                formResponse: getIn(licence, ['risk', 'riskManagement']),
                formType: 'riskManagement',
                pageConfig: riskConfig.riskManagement,
                section: 'risk',
                missingMessage: 'Enter the risk management and victim liaison details'
            },
            {
                formResponse: getIn(licence, ['curfew', 'curfewHours']),
                formType: 'curfewHours',
                pageConfig: curfewConfig.curfewHours,
                section: 'curfew',
                missingMessage: 'Enter the proposed curfew hours'
            },
            {
                formResponse: getIn(licence, ['reporting', 'reportingInstructions']),
                formType: 'reportingInstructions',
                pageConfig: reportingConfig.reportingInstructions,
                section: 'reporting',
                missingMessage: 'Enter the reporting instructions'
            }
        ],
        PROCESSING_RO_ADDRESS_REJECTED: [
            {
                formResponse: lastItem(getIn(licence, ['proposedAddress', 'curfewAddress', 'addresses']) || []),
                formType: 'curfewAddressReview',
                pageConfig: curfewConfig.curfewAddressReview,
                section: 'curfewAddress',
                missingMessage: 'Enter the curfew address review details'
            },
            {
                formResponse: lastItem(getIn(licence, ['proposedAddress', 'curfewAddress', 'addresses']) || []),
                formType: 'addressSafety',
                pageConfig: curfewConfig.addressSafety,
                section: 'curfewAddress',
                missingMessage: 'Enter the curfew address review details'
            }
        ],
        BASS_REFERRAL: [
            {
                formResponse: getIn(licence, ['bassReferral', 'bassRequest']),
                formType: 'bassRequest',
                pageConfig: bassConfig.bassRequest,
                section: 'bassReferral',
                missingMessage: 'Enter the bass referral details'
            },
            {
                formResponse: getIn(licence, ['bassReferral', 'bassAreaCheck']),
                formType: 'bassAreaCheck',
                pageConfig: bassConfig.bassAreaCheck,
                section: 'bassReferral',
                missingMessage: 'Enter the bass area check details'
            },
            {
                formResponse: getIn(licence, ['bassReferral', 'bassOffer']),
                formType: 'bassReferral',
                pageConfig: bassConfig.bassOffer,
                section: 'bassOffer',
                missingMessage: 'Enter the bass offer details'
            }
        ],
        BASS_REQUEST: [
            {
                formResponse: getIn(licence, ['bassReferral', 'bassRequest']),
                formType: 'bassRequest',
                pageConfig: bassConfig.bassRequest,
                section: 'bassReferral',
                missingMessage: 'Enter the bass referral details'
            }
        ],
        PROCESSING_RO_BASS_REQUESTED: [
            {
                formResponse: getIn(licence, ['bassReferral', 'bassRequest']),
                formType: 'bassRequest',
                pageConfig: bassConfig.bassRequest,
                section: 'bassReferral',
                missingMessage: 'Enter the bass referral details'
            },
            {
                formResponse: getIn(licence, ['bassReferral', 'bassAreaCheck']),
                formType: 'bassReferral',
                pageConfig: bassConfig.bassAreaCheck,
                section: 'bassAreaCheck',
                missingMessage: 'Enter the bass area check details'
            },
            {
                formResponse: getIn(licence, ['bassReferral', 'bassOffer']),
                formType: 'bassOffer',
                pageConfig: bassConfig.bassOffer,
                section: 'bassReferral',
                missingMessage: 'Enter the bass offer details'
            },
            {
                formResponse: getIn(licence, ['risk', 'riskManagement']),
                formType: 'riskManagement',
                pageConfig: riskConfig.riskManagement,
                section: 'risk',
                missingMessage: 'Enter the risk management and victim liaison details'
            },
            {
                formResponse: getIn(licence, ['curfew', 'curfewHours']),
                formType: 'curfewHours',
                pageConfig: curfewConfig.curfewHours,
                section: 'curfew',
                missingMessage: 'Enter the proposed curfew hours'
            },
            {
                formResponse: getIn(licence, ['reporting', 'reportingInstructions']),
                formType: 'reportingInstructions',
                pageConfig: reportingConfig.reportingInstructions,
                section: 'reporting',
                missingMessage: 'Enter the reporting instructions'
            }
        ]
    };

    return groups[group].reduce((errorObject, formInfo) => {
        const {section, formType, formResponse, missingMessage} = formInfo;

        const formErrors = formResponse ? validate(formInfo) : missingMessage;
        if (isEmpty(formErrors)) {
            return errorObject;
        }

        return mergeWithRight(errorObject, {
            [section]: {
                [formType]: formErrors
            }
        });
    }, {});
}

function createSchemaFromConfig(pageConfig, bespokeData) {
    const formSchema = pageConfig.fields.reduce((schema, field) => {
        const fieldName = getFieldName(field);

        const bespokeRequirements = getFieldDetail(['conditionallyActive'], field);
        const conditionFulfilled = isEmpty(bespokeRequirements) ? true : isFulfilled(bespokeRequirements, bespokeData);
        if (!conditionFulfilled) {
            return mergeWithRight(schema, {[fieldName]: joi.any().optional()});
        }

        const fieldConfigResponseType = getFieldDetail(['responseType'], field);
        const [responseType, ...arguments] = fieldConfigResponseType.split('_');

        const joiFieldItem = fieldOptions[responseType];
        const joiFieldSchema = typeof joiFieldItem === 'function' ? joiFieldItem(...arguments) : joiFieldItem;

        return mergeWithRight(schema, {[fieldName]: joiFieldSchema});
    }, {});

    return joi.object().keys(formSchema);
}

function isFulfilled(requirement, data) {
    const requirementName = getFieldName(requirement);
    const requiredAnswer = requirement[requirementName];

    return data[requirementName] === requiredAnswer;
}