module.exports = {
    curfewAddressReview: {
        licenceMap: ['licence', 'proposedAddress', 'curfewAddress'],
        fields: [
            {landLordHDCConsent: {}},
            {hasElectricitySupply: {dependentOn: 'landLordHDCConsent', predicate: 'Yes'}},
            {homeVisitConducted: {dependentOn: 'landLordHDCConsent', predicate: 'Yes'}},
            {managedSafely: {}},
            {managedSafelyReasons: {dependentOn: 'managedSafely', predicate: 'No'}}
        ],
        nextPath: '/hdc/licenceConditions/standardConditions/'
    },
    standardConditions: {
        nextPathDecision: {
            discriminator: 'additionalConditions',
            Yes: '/hdc/licenceConditions/additionalConditions/',
            No: '/hdc/licenceConditions/riskManagement/'
        }
    },
    conditionsSummary: {
        nextPath: '/hdc/licenceConditions/riskManagement/'
    },
    riskManagement: {
        licenceSection: 'riskManagement',
        fields: [
            {planningActions: {}},
            {planningActionsDetails: {dependentOn: 'planningActions', predicate: 'Yes'}},
            {awaitingInformation: {}},
            {awaitingInformationDetails: {dependentOn: 'awaitingInformation', predicate: 'Yes'}},
            {victimLiaison: {}},
            {victimLiaisonDetails: {dependentOn: 'victimLiaison', predicate: 'Yes'}}
        ],
        nextPath: '/licenceDetails/'
    }
};
