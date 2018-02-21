const {expect} = require('../testSetup');
const {getStatusLabel} = require('../../server/utils/licenceStatusLabels');
const {roles} = require('../../server/models/roles');
const {licenceStages} = require('../../server/models/licenceStages');

describe('getStatusLabel', () => {

    describe('default label for unstarted licences', () => {

        const defaultLabel = 'Not started';

        const examples = [
            {status: undefined, reason: 'missing'},
            {status: {}, reason: 'empty'},
            {status: {stage: licenceStages.ELIGIBILITY, tasks: {}}, reason: 'missing decisions'},
            {status: {stage: licenceStages.ELIGIBILITY, decisions: {}}, reason: 'missing tasks'}
        ];

        examples.forEach(example => {
            it(`should give default label when licence is ${example.reason}`, () => {
                expect(getStatusLabel(example.status, roles.CA)).to.eql(defaultLabel);
            });
        });
    });


    describe('CA user labels', () => {

        describe('ELIGIBILITY stage', () => {
            const examples = [
                {
                    status: {stage: licenceStages.ELIGIBILITY, decisions: {}, tasks: {}},
                    label: 'Eligibility checks ongoing'
                },
                {
                    status: {stage: licenceStages.ELIGIBILITY, decisions: {excluded: true}, tasks: {}},
                    label: 'Excluded (Ineligible)'
                },
                {
                    status: {stage: licenceStages.ELIGIBILITY, decisions: {insufficientTime: true}, tasks: {}},
                    label: 'Excluded (Insufficient time)'
                },
                {
                    status: {stage: licenceStages.ELIGIBILITY, decisions: {unsuitable: true}, tasks: {}},
                    label: 'Presumed unsuitable'
                },
                {
                    status: {stage: licenceStages.ELIGIBILITY, decisions: {immigrationCheckNeeded: true}, tasks: {}},
                    label: 'Immigration status check requested'
                },
                {
                    status: {stage: licenceStages.ELIGIBILITY, decisions: {optedOut: true}, tasks: {}},
                    label: 'Opted out'
                },
                {
                    status: {stage: licenceStages.ELIGIBILITY, decisions: {bassReferralNeeded: true}, tasks: {}},
                    label: 'Address/Opt-out form sent'
                }
            ];

            assertLabels(examples, roles.CA);
        });

        describe('ELIGIBILITY stage - message priority when multiple reasons', () => {

            const examples = [
                {
                    status: {stage: licenceStages.ELIGIBILITY,
                    decisions: {excluded: true, insufficientTime: true, unsuitable: true}, tasks: {}},
                    label: 'Excluded (Ineligible)'
                },
                {
                    status: {stage: licenceStages.ELIGIBILITY,
                        decisions: {insufficientTime: true, unsuitable: true}, tasks: {}},
                    label: 'Presumed unsuitable'
                }
            ];

            assertLabels(examples, roles.CA);
        });


        describe('PROCESSING_CA stage', () => {
            const examples = [
                {
                    status: {stage: licenceStages.PROCESSING_CA, decisions: {}, tasks: {}},
                    label: 'Final Checks'
                },
                {
                    status: {stage: licenceStages.PROCESSING_CA, decisions: {excluded: true}, tasks: {}},
                    label: 'Excluded (Ineligible)'
                },
                {
                    status: {stage: licenceStages.PROCESSING_CA, decisions: {curfewAddressApproved: false}, tasks: {}},
                    label: 'Address not suitable'
                },
                {
                    status: {stage: licenceStages.PROCESSING_CA, decisions: {postponed: true}, tasks: {}},
                    label: 'Postponed'
                }
            ];

            assertLabels(examples, roles.CA);
        });

        describe('PROCESSING_CA stage - message priority when multiple reasons', () => {

            const examples = [
                {
                    status: {stage: licenceStages.PROCESSING_CA,
                        decisions: {excluded: true, curfewAddressApproved: false, postponed: true}, tasks: {}},
                    label: 'Postponed'
                },
                {
                    status: {stage: licenceStages.PROCESSING_CA,
                        decisions: {excluded: true, curfewAddressApproved: false}, tasks: {}},
                    label: 'Excluded (Ineligible)'
                }
            ];

            assertLabels(examples, roles.CA);
        });

        describe('Other stages', () => {

            const examples = [
                {
                    status: {stage: licenceStages.PROCESSING_RO, decisions: {}, tasks: {}},
                    label: 'Submitted to RO'
                },
                {
                    status: {stage: licenceStages.APPROVAL, decisions: {}, tasks: {}},
                    label: 'Submitted to DM'
                },
                {
                    status: {stage: licenceStages.DECIDED, decisions: {approved: true}, tasks: {}},
                    label: 'Approved'
                },
                {
                    status: {stage: licenceStages.DECIDED, decisions: {refused: true}, tasks: {}},
                    label: 'Refused'
                }
            ];

            assertLabels(examples, roles.CA);
        });

    });

    describe('RO user labels', () => {

        describe('PROCESSING_RO stage', () => {
            const examples = [
                {
                    status: {stage: licenceStages.PROCESSING_RO, decisions: {}, tasks: {}},
                    label: 'Awaiting Assessment'
                },
                {
                    status: {stage: licenceStages.PROCESSING_RO, decisions: {}, tasks: {curfewAddressReview: 'DONE'}},
                    label: 'Assessment ongoing'
                },
                {
                    status: {stage: licenceStages.PROCESSING_RO, decisions: {}, tasks: {curfewHours: 'STARTED'}},
                    label: 'Assessment ongoing'
                },
                {
                    status: {stage: licenceStages.PROCESSING_RO, decisions: {}, tasks: {licenceConditions: 'DONE'}},
                    label: 'Assessment ongoing'
                },
                {
                    status: {stage: licenceStages.PROCESSING_RO, decisions: {}, tasks: {riskManagement: 'STARTED'}},
                    label: 'Assessment ongoing'
                },
                {
                    status: {stage: licenceStages.PROCESSING_RO, decisions: {}, tasks: {reportingInstructions: 'DONE'}},
                    label: 'Assessment ongoing'
                }
            ];

            assertLabels(examples, roles.RO);
        });

        describe('Other stages', () => {

            const examples = [
                {
                    status: {stage: licenceStages.ELIGIBILITY, decisions: {}, tasks: {}},
                    label: 'Eligibility checks ongoing'
                },
                {
                    status: {stage: licenceStages.PROCESSING_CA, decisions: {}, tasks: {}},
                    label: 'Submitted to PCA'
                },
                {
                    status: {stage: licenceStages.APPROVAL, decisions: {approved: true}, tasks: {}},
                    label: 'Submitted to DM'
                },
                {
                    status: {stage: licenceStages.DECIDED, decisions: {approved: true}, tasks: {}},
                    label: 'Approved'
                },
                {
                    status: {stage: licenceStages.DECIDED, decisions: {refused: true}, tasks: {}},
                    label: 'Refused'
                }
            ];

            assertLabels(examples, roles.RO);
        });
    });

    describe('DM user labels', () => {

        describe('Other stages', () => {

            const examples = [
                {
                    status: {stage: licenceStages.APPROVAL, decisions: {}, tasks: {}},
                    label: 'Awaiting Decision'
                }
            ];

            assertLabels(examples, roles.DM);
        });

        describe('Other stages', () => {

            const examples = [
                {
                    status: {stage: licenceStages.ELIGIBILITY, decisions: {}, tasks: {}},
                    label: 'Eligibility checks ongoing'
                },
                {
                    status: {stage: licenceStages.PROCESSING_RO, decisions: {}, tasks: {}},
                    label: 'Submitted to RO'
                },
                {
                    status: {stage: licenceStages.PROCESSING_CA, decisions: {}, tasks: {}},
                    label: 'Submitted to PCA'
                },
                {
                    status: {stage: licenceStages.DECIDED, decisions: {approved: true}, tasks: {}},
                    label: 'Approved'
                },
                {
                    status: {stage: licenceStages.DECIDED, decisions: {refused: true}, tasks: {}},
                    label: 'Refused'
                }
            ];

            assertLabels(examples, roles.DM);
        });
    });

    function assertLabels(examples, role) {
        examples.forEach(example => {
            it(`should give ${example.label}`, () => {
                expect(getStatusLabel(example.status, role)).to.eql(example.label);
            });
        });
    }
})
;