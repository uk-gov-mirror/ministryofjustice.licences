module.exports = {
    optOut: {
        fields: [
            {decision: {}},
            {reason: {dependantOn: 'decision', predicate: 'Yes'}}
        ],
        nextPathDecision: {
            fieldToDecideOn: 'decision',
            Yes: '/hdc/taskList/',
            No: '/hdc/proposedAddress/bassReferral/'
        }
    },
    bassReferral: {
        nextPath: '/hdc/taskList/',
        fields: [
            {decision: {}},
            {proposedTown: {dependantOn: 'decision', predicate: 'Yes'}},
            {proposedCounty: {dependantOn: 'decision', predicate: 'Yes'}}
        ]
    }
};
