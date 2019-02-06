const {pick, pickBy, pickKey, keys, mapObject, isEmpty} = require('../../utils/functionalHelpers');
const versionInfo = require('../../utils/versionInfo');
const getDmTasks = require('./taskLists/dmTasks');
const postponement = require('./taskLists/tasks/postponement');
const bassOffer = require('./taskLists/tasks/bassOffer');

const getVersionLabel = ({approvedVersion}) => `Licence version ${approvedVersion}`;
const getNextVersionLabel = ({version}) => `Ready to create version ${version}`;
const getPdfLink = ({approvedVersionDetails}) => `/hdc/pdf/create/${approvedVersionDetails.template}/`;

const taskListsConfig = {
    caTasksEligibility: {
        stages: ['ELIGIBILITY', 'UNSTARTED'],
        role: 'CA'
    },
    caTasksPostApproval: {
        stages: ['DECIDED', 'MODIFIED', 'MODIFIED_APPROVAL'],
        role: 'CA'
    },
    caTasksFinalChecks: {
        stages: ['PROCESSING_CA', 'PROCESSING_RO', 'APPROVAL'],
        role: 'CA'
    },
    roTasks: {
        stages: ['PROCESSING_RO', 'PROCESSING_CA', 'APPROVAL', 'ELIGIBILITY'],
        role: 'RO'
    },
    roTasksPostApproval: {
        stages: ['DECIDED', 'MODIFIED', 'MODIFIED_APPROVAL'],
        role: 'RO'
    },
    dmTasks: {
        role: 'DM'
    }
};

const tasksConfig = {
    caTasksEligibility: [
        {task: 'eligibilityTask', filters: []},
        {task: 'informOffenderTask', filters: ['eligibilityDone', 'optOutUnstarted', '!optedOut']},
        {task: 'proposedAddressTask', filters: ['eligible']},
        {task: 'caSubmitRefusalTask', filters: ['caToDmRefusal']},
        {task: 'caSubmitBassReviewTask', filters: ['optOutDone', '!optedOut', 'bassReferralNeeded', '!caToDmRefusal']},
        {
            task: 'caSubmitAddressReviewTask',
            filters: ['optOutDone', '!optedOut', '!bassReferralNeeded', '!caToDmRefusal']
        }
    ],
    caTasksFinalChecks: [
        {task: 'curfewAddressTask', filters: ['!bassReferralNeeded', '!caToRo']},
        {task: 'proposedAddressTask', filters: ['caToRo']},
        {
            title: 'BASS address',
            label: bassOffer.getLabel,
            action: bassOffer.getAction,
            filters: ['bassReferralNeeded']
        },
        {task: 'riskManagementTask', filters: ['addressOrBassChecksDoneOrUnsuitable']},
        {task: 'victimLiaisonTask', filters: ['addressOrBassChecksDone']},
        {task: 'curfewHoursTask', filters: ['addressOrBassChecksDone']},
        {task: 'additionalConditionsTask', filters: ['addressOrBassChecksDone']},
        {task: 'reportingInstructionsTask', filters: ['addressOrBassChecksDone']},
        {task: 'finalChecksTask', filters: ['addressOrBassChecksDone']},
        {
            filters: ['addressOrBassChecksDone'],
            title: 'Postpone or refuse',
            label: postponement.getLabel,
            action: postponement.getAction
        },
        {task: 'HDCRefusalTask', filters: []},
        {task: 'caSubmitApprovalTask', filters: ['!optedOut', '!caToDmRefusal', '!caToRo']},
        {task: 'caSubmitRefusalTask', filters: ['!optedOut', 'caToDmRefusal']},
        {task: 'caSubmitAddressReviewTask', filters: ['!optedOut', 'caToRo', '!bassReferralNeeded']},
        {task: 'caSubmitBassReviewTask', filters: ['!optedOut', 'caToRo', 'bassReferralNeeded']}
    ],
    caTasksPostApproval: [
        {task: 'eligibilitySummaryTask', filters: ['addressOrBassOffered']},
        {task: 'proposedAddressTask', filters: ['eligible', 'caToRo']},
        {task: 'bassAddressTask', filters: ['eligible', '!caToRo', 'bassReferralNeeded']},
        {task: 'curfewAddressTask', filters: ['eligible', '!caToRo', '!bassReferralNeeded']},
        {task: 'riskManagementTask', filters: ['eligible', 'addressOrBassOfferedOrUnsuitable']},
        {task: 'victimLiaisonTask', filters: ['eligible', 'addressOrBassOffered']},
        {task: 'curfewHoursTask', filters: ['eligible', 'addressOrBassOffered']},
        {task: 'additionalConditionsTask', filters: ['eligible', 'addressOrBassOffered']},
        {task: 'reportingInstructionsTask', filters: ['eligible', 'addressOrBassOffered']},
        {task: 'finalChecksTask', filters: ['eligible', 'addressOrBassOffered']},
        {
            title: 'Postpone or refuse',
            filters: ['eligible', 'addressOrBassOffered'],
            label: postponement.getLabel,
            action: postponement.getAction
        },
        {task: 'HDCRefusalTask', filters: ['eligible', '!dmRefused']},
        {task: 'caSubmitApprovalTask', filters: ['eligible', 'caToDm']},
        {task: 'caSubmitRefusalTask', filters: ['eligible', 'caToDmRefusal']},
        {task: 'caSubmitBassReviewTask', filters: ['eligible', 'caToRo', 'bassReferralNeeded']},
        {task: 'caSubmitAddressReviewTask', filters: ['eligible', 'caToRo', '!bassReferralNeeded']},
        {
            task: 'createLicenceTask',
            filters: ['eligible', 'addressOrBassOffered', '!caToDm', '!caToDmRefusal', '!caToRo']
        },
        {task: 'informOffenderTask', filters: ['!eligible']}
    ],
    roTasks: [
        {task: 'bassAreaTask', filters: ['bassReferralNeeded']},
        {task: 'curfewAddressTask', filters: ['!addressRejectedInRiskTask', '!bassReferralNeeded']},
        {task: 'riskManagementTask', filters: ['!addressRejectedInReviewTask']},
        {task: 'victimLiaisonTask', filters: ['!curfewAddressRejected']},
        {task: 'curfewHoursTask', filters: ['!curfewAddressRejected']},
        {task: 'additionalConditionsTask', filters: ['!curfewAddressRejected']},
        {task: 'reportingInstructionsTask', filters: ['!curfewAddressRejected']},
        {task: 'roSubmitTask', filters: []}
    ],
    vary: [
        {
            filters: ['licenceVersionExists', '!isNewVersion'],
            title: 'View current licence',
            action: {type: 'btn', text: 'View', href: getPdfLink},
            label: getVersionLabel
        },
        {
            task: 'varyLicenceTask',
            filters: ['licenceUnstarted']
        },
        {
            filters: ['!licenceUnstarted'],
            title: 'Permission for variation',
            action: {type: 'link', text: 'Change', href: '/hdc/vary/evidence/'}
        },
        {
            filters: ['!licenceUnstarted'], title: 'Curfew address',
            action: {type: 'link', text: 'Change', href: '/hdc/vary/address/'}
        },
        {
            filters: ['!licenceUnstarted'],
            title: 'Additional conditions',
            action: {type: 'link', text: 'Change', href: '/hdc/licenceConditions/standard/'}
        },
        {
            filters: ['!licenceUnstarted'],
            title: 'Curfew hours',
            action: {type: 'link', text: 'Change', href: '/hdc/curfew/curfewHours/'}
        },
        {
            filters: ['!licenceUnstarted'],
            title: 'Reporting instructions',
            action: {type: 'link', text: 'Change', href: '/hdc/vary/reportingAddress/'}
        },
        {
            filters: ['!licenceUnstarted', 'isNewVersion'],
            title: 'Create licence',
            action: {type: 'btn', text: 'Continue', href: '/hdc/pdf/select/'},
            label: getNextVersionLabel
        }
    ],
    noTaskList: [
        {
            title: 'No active licence',
            action: {type: 'link', text: 'Return to case list', href: '/caseList/'},
            filters: []
        }
    ]
};

module.exports = (
    role,
    postRelease,
    {decisions, tasks, stage},
    {version, versionDetails, approvedVersion, approvedVersionDetails},
    allowedTransition
) => {
    const taskList = getTaskList(role, stage, postRelease);
    const getTaskListMethod = {
        dmTasks: getDmTasks
    };
    if (!tasksConfig[taskList] && !getTaskListMethod[taskList]) {
        return {taskListView: taskList};
    }

    const {
        bassReferralNeeded,
        curfewAddressApproved,
        optedOut,
        eligible,
        dmRefused,
        curfewAddressRejected,
        addressUnsuitable,
        addressReviewFailed
    } = decisions;

    const {
        eligibility,
        optOut
    } = tasks;

    const {bassChecksDone, bassOfferMade} = getBassDetails(decisions, tasks);

    const filtersForTaskList = keys(pickBy(item => item, {
        bassReferralNeeded,
        optedOut,
        eligible,
        [allowedTransition]: allowedTransition,
        dmRefused,
        curfewAddressRejected,
        eligibilityDone: eligibility === 'DONE',
        optOutDone: optOut === 'DONE',
        optOutUnstarted: optOut === 'UNSTARTED',
        addressOrBassChecksDone: curfewAddressApproved || bassChecksDone,
        addressOrBassChecksDoneOrUnsuitable: curfewAddressApproved || bassChecksDone || addressUnsuitable,
        addressOrBassOffered: curfewAddressApproved || bassOfferMade,
        addressRejectedInReviewTask: addressReviewFailed,
        addressRejectedInRiskTask: addressUnsuitable,
        addressOrBassOfferedOrUnsuitable: curfewAddressApproved || bassOfferMade || addressUnsuitable,
        licenceUnstarted: stage === 'UNSTARTED',
        licenceVersionExists: !isEmpty(approvedVersionDetails),
        isNewVersion: versionInfo({version, versionDetails, approvedVersionDetails}).isNewVersion
    }));

    const filteredTasks = getTaskListMethod[taskList] ?
        getTaskListMethod[taskList]({decisions, tasks, stage}) :
        tasksConfig[taskList].filter(filtersMatch(filtersForTaskList));

    return {
        taskListModel: filteredTasks.map(decorateTaskModel(approvedVersion, version, approvedVersionDetails, decisions, tasks))
    };
};

const filtersMatch = filterList => task => task.filters.every(filter => {
    if (filter[0] !== '!') {
        return filterList.includes(filter);
    }
    return !filterList.includes(filter.slice(1));
});

const decorateTaskModel = (approvedVersion, version, approvedVersionDetails, decisions, tasks) => task => {
    const rawConfig = pick(['task', 'title', 'label', 'action'], task);
    const callAnyFunctions = value => {
        if (typeof value === 'string') {
            return value;
        }
        if (typeof value === 'function') {
            return value({approvedVersion, version, approvedVersionDetails, decisions, tasks});
        }
        return mapObject(callAnyFunctions, value);
    };
    return mapObject(callAnyFunctions, rawConfig);
};

function getTaskList(role, stage, postRelease) {
    if (postRelease) {
        return 'vary';
    }

    function roleAndStageMatch(view) {
        if (view.role !== role) {
            return false;
        }
        if (!view.stages) {
            return true;
        }
        return view.stages.includes(stage);
    }

    return pickKey(roleAndStageMatch, taskListsConfig) || 'noTaskList';
}

function getBassDetails({bassReferralNeeded, bassAccepted, bassWithdrawn}, {bassAreaCheck, bassOffer}) {
    const bassExcluded = ['Unavailable', 'Unsuitable'].includes(bassAccepted);
    const bassAreaChecked = bassAreaCheck === 'DONE';

    return {
        bassChecksDone: bassReferralNeeded && bassAreaChecked && !bassWithdrawn && !bassExcluded,
        bassOfferMade: bassReferralNeeded && bassOffer === 'DONE' && !bassWithdrawn && !bassExcluded
    };
}
