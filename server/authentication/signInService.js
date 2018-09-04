const superagent = require('superagent');
const querystring = require('querystring');
const config = require('../config');
const {generateOauthClientToken, generateAdminOauthClientToken} = require('./oauth');
const logger = require('../../log');

const timeoutSpec = {
    response: config.nomis.timeout.response,
    deadline: config.nomis.timeout.deadline
};

const RO_ROLE_CODE = 'RO';

function signInService(audit) {

    return {

        signIn: async function(username, password) {

            logger.info(`Log in for: ${username}`);

            try {
                const {profile, role, token, refreshToken, expiresIn} = await login(username.toUpperCase(), password);
                logger.info(`Log in success - token: ${token}`);

                const userDetail = profile.staffId || profile.username || profile.lastName || 'no user id';
                audit.record('LOGIN', userDetail);

                const activeCaseLoad =
                    profile.activeCaseLoadId ? await getCaseLoad(token, profile.activeCaseLoadId) : null;

                return {
                    ...profile,
                    token,
                    refreshToken,
                    refreshTime: getRefreshTime(expiresIn),
                    role,
                    activeCaseLoad,
                    username
                };

            } catch (error) {
                if (unauthorised(error)) {
                    logger.error(`Forbidden Elite2 login for [${username}]:`, error.stack);
                    return {};
                }

                logger.error(`Elite 2 login error [${username}]:`, error.stack);
                throw error;
            }
        },

        getRefreshedToken: async function(user) {
            logger.info(`Refreshing token for : ${user.username}`);

            const {token, refreshToken, expiresIn} = await getRefreshTokens(
                user.username, user.role, user.refreshToken
            );

            const refreshTime = getRefreshTime(expiresIn);

            return {token, refreshToken, refreshTime};

        }
    };

    function getRefreshTime(expiresIn) {
        // arbitrary five minute before expiry time
        const now = new Date();
        const secondsUntilExpiry = now.getSeconds() + (expiresIn - 300);
        return now.setSeconds(secondsUntilExpiry);
    }

    async function login(username, password) {

        const {token, refreshToken, expiresIn} = await getPasswordTokens(username, password);

        const [profile, role] = await Promise.all([
            getUserProfile(token, username),
            getRoleCode(token)
        ]);

        if (role === RO_ROLE_CODE) {
            const roToken = await getClientCredentialsTokens(username);
            return {profile, role, ...roToken};
        }

        return {profile, role, token, refreshToken, expiresIn};
    }

    async function getPasswordTokens(username, password) {
        const oauthClientToken = generateOauthClientToken();
        const oauthRequest = {grant_type: 'password', username, password};

        return oauthTokenRequest(oauthClientToken, oauthRequest);
    }

    async function getClientCredentialsTokens(username) {
        const oauthAdminClientToken = generateAdminOauthClientToken();
        const oauthRequest = {grant_type: 'client_credentials', username};

        return oauthTokenRequest(oauthAdminClientToken, oauthRequest);
    }

    async function getRefreshTokens(username, role, refreshToken) {

        if (role === RO_ROLE_CODE) {
            logger.info('RO client credentials token refresh');
            return getClientCredentialsTokens(username);
        }

        const oauthClientToken = generateOauthClientToken();
        const oauthRequest = {grant_type: 'refresh_token', refresh_token: refreshToken};

        return oauthTokenRequest(oauthClientToken, oauthRequest);
    }
}

async function oauthTokenRequest(clientToken, oauthRequest) {
    const oauthResult = await getOauthToken(clientToken, oauthRequest);
    logger.info(`Oauth request for grant type '${oauthRequest.grant_type}', result status: ${oauthResult.status}`);

    return parseOauthTokens(oauthResult);
}

function getOauthToken(oauthClientToken, requestSpec) {

    const oauthRequest = querystring.stringify(requestSpec);

    return superagent
        .post(`${getOauthUrl()}/oauth/token`)
        .set('Authorization', oauthClientToken)
        .set('content-type', 'application/x-www-form-urlencoded')
        .send(oauthRequest)
        .timeout(timeoutSpec);
}

function parseOauthTokens(oauthResult) {

    const token = `${oauthResult.body.token_type} ${oauthResult.body.access_token}`;
    const refreshToken = oauthResult.body.refresh_token;
    const expiresIn = oauthResult.body.expires_in;

    return {token, refreshToken, expiresIn};
}

async function getUserProfile(token, username) {
    const profileResult = await nomisGet('/users/me', token);
    logger.info(`Elite2 profile success for [${username}]`);
    return profileResult.body;
}

const allowedRoles = config.roles.admin.concat(config.roles.user);

async function getRoleCode(token) {

    const rolesResult = await nomisGet('/users/me/roles', token);
    const roles = rolesResult.body;
    logger.info(`Roles response [${JSON.stringify(roles)}]`);

    if (roles && roles.length > 0) {
        const role = roles.find(role => {
            const roleCode = role.roleCode.substring(role.roleCode.lastIndexOf('_') + 1);
            return allowedRoles.includes(roleCode);
        });

        if (role) {
            const roleCode = role.roleCode.substring(role.roleCode.lastIndexOf('_') + 1);
            logger.info(`Selected role: ${role.roleCode}, giving role code: ${roleCode}`);
            return roleCode;
        }
    }

    throw new Error('Login error - no acceptable role');
}

async function getCaseLoad(token, id) {

    try {
        const result = await nomisGet('/users/me/caseLoads', token);
        return result.body.find(caseLoad => caseLoad.caseLoadId === id) || null;

    } catch (error) {
        logger.error('No active case load', error.stack);
        return null;
    }
}

function nomisGet(path, token) {
    return superagent
        .get(`${config.nomis.apiUrl}${path}`)
        .set('Authorization', token)
        .timeout(timeoutSpec);
}

function getOauthUrl() {
    return config.nomis.apiUrl.replace('/api', '');
}

function unauthorised(error) {
    return [400, 401, 403].includes(error.status);
}

module.exports = function createSignInService(tokenStore, audit) {
    return signInService(tokenStore, audit);
};
