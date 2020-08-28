const request = require('supertest')
const express = require('express')
const path = require('path')
const bodyParser = require('body-parser')
const cookieSession = require('cookie-session')
const flash = require('connect-flash')
const pdfRenderer = require('@ministryofjustice/express-template-to-pdf')
const { mockAudit } = require('./mockClients')
const NullTokenVerifier = require('../server/authentication/tokenverifier/NullTokenVerifier')

const { createSignInServiceStub, createPrisonerServiceStub, createLicenceServiceStub } = require('./mockServices')
const standardRouter = require('../server/routes/routeWorkers/standardRouter')

function testFormPageGets(app, routes, licenceServiceStub) {
  describe('licence exists for bookingId', () => {
    routes.forEach((route) => {
      test(`renders the ${route.url} page`, () => {
        return request(app)
          .get(route.url)
          .expect(200)
          .expect('Content-Type', /html/)
          .expect((res) => {
            expect(res.text).toContain(route.content)
          })
      })
    })
  })

  describe('licence doesnt exists for bookingId', () => {
    beforeEach(() => {
      licenceServiceStub.getLicence.mockResolvedValue(null)
    })
    routes.forEach((route) => {
      test(`renders the ${route.url} page`, () => {
        return request(app)
          .get(route.url)
          .expect(302)
          .expect((res) => {
            expect(res.header.location).toBe('/')
          })
      })
    })
  })
}

const users = {
  caUser: {
    name: 'ca last',
    token: 'token',
    role: 'CA',
    username: 'CA_USER_TEST',
    activeCaseLoad: {
      caseLoadId: 'caseLoadId',
      description: '---',
    },
    activeCaseLoadId: 'caseLoadId',
  },
  roUser: {
    name: 'ro last',
    username: 'RO_USER',
    token: 'token',
    role: 'RO',
  },
  dmUser: {
    name: 'dm last',
    username: 'DM_USER',
    token: 'token',
    role: 'DM',
  },
  batchUser: {
    name: 'nb last',
    username: 'NOMIS_BATCHLOAD',
    token: 'token',
    role: 'BATCHLOAD',
  },
}
const appSetup = (route, user = 'caUser', prefix = '') => {
  const app = express()

  app.set('views', path.join(__dirname, '../server/views'))
  app.set('view engine', 'pug')

  const userObj = users[user]
  app.use((req, res, next) => {
    req.user = userObj
    res.locals.user = userObj
    next()
  })
  app.use(cookieSession({ keys: [''] }))
  app.use(flash())
  app.use(pdfRenderer())
  app.use(bodyParser.json())
  app.use(bodyParser.urlencoded({ extended: false }))
  app.use(prefix, route)
  app.use((error, req, res, next) => {
    if (error.status !== 403) {
      // eslint-disable-next-line no-console
      console.log('an error occurred:', error)
    }
    next(error)
  })

  return app
}

const startRoute = (route, urlPath, user, auditKey, config, audit = mockAudit()) => {
  const signInService = createSignInServiceStub()
  const prisonerService = createPrisonerServiceStub()
  const licenceService = createLicenceServiceStub()
  const baseRouter = standardRouter({
    licenceService,
    prisonerService,
    audit,
    signInService,
    tokenVerifier: new NullTokenVerifier(),
    config,
  })
  const builtRoute = baseRouter(route, { auditKey })
  return appSetup(builtRoute, user, urlPath)
}

module.exports = {
  testFormPageGets,
  users,
  appSetup,
  startRoute,
}
