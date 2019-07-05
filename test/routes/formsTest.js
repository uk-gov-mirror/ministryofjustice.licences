const pdfParse = require('pdf-parse')
const request = require('supertest')
const { appSetup, authenticationMiddleware, createSignInServiceStub } = require('../supertestSetup')
const standardRouter = require('../../server/routes/routeWorkers/standardRouter')
const createRoute = require('../../server/routes/forms')

describe('/forms/', () => {
  let licenceService
  let prisonerService
  let formService

  let app

  const licence = { licence: {}, stage: 'DECIDED' }
  const formTemplateData = {
    OFF_NAME: 'Mark Andrews',
    OFF_NOMS: 'A5001DY',
    EST_PREMISE: 'HMP Albany',
    CREATION_DATE: '25th June 2019',
    SENT_HDCED: '23rd August 2019',
    SENT_CRD: '15th October 2019',
  }
  const prisoner = {
    lastName: 'LAST',
    firstName: 'FIRST MIDDLE',
    dateOfBirth: '01/01/2001',
    agencyLocationId: '123',
  }
  const curfewData = {
    prisoner,
    sentenceDetail: {},
    isBass: false,
    curfewAddress: {},
    curfewAddressReview: {},
    occupier: {},
    prisonEmail: {},
    reportingInstructions: {},
    conditions: { standardConditions: ['STANDARD CONDITION'], additionalConditions: ['ADDITIONAL CONDITION'] },
    riskManagement: {},
    victimLiaison: {},
    responsibleOfficer: {},
  }

  beforeEach(() => {
    licenceService = {
      getLicence: sinon.stub().resolves(licence),
    }
    prisonerService = {
      getPrisonerPersonalDetails: sinon.stub().resolves(prisoner),
      getPrisonerDetails: sinon.stub().resolves(prisoner),
      getResponsibleOfficer: sinon.stub().resolves({}),
    }
    formService = {
      getTemplateData: sinon.stub().resolves(formTemplateData),
      getCurfewAddressCheckData: sinon.stub().resolves(curfewData),
    }
  })

  describe('/:templateName/:bookingId/', () => {
    it('calls formService', () => {
      app = createApp('caUser')

      return request(app)
        .get('/hdc/forms/eligible/1')
        .expect(200)
        .expect('Content-Type', 'application/pdf')
        .expect(res => {
          expect(Buffer.isBuffer(res.body)).to.equal(true)
        })
        .expect(() => {
          expect(formService.getTemplateData).to.be.calledOnce()
          expect(formService.getTemplateData).to.be.calledWith('eligible', licence.licence, prisoner)
        })
    })

    it('should throw if a non CA tries to access the page', () => {
      app = createApp('dmUser')

      return request(app)
        .get('/hdc/forms/eligible/1')
        .expect(403)
    })

    it('should throw if unknown form template name', () => {
      app = createApp('caUser')

      return request(app)
        .get('/hdc/forms/unknown/1')
        .expect(500)
    })

    it('Generates a PDF - hard to verify exactly but can at least check that some values appear in the output', async () => {
      app = createApp('caUser')

      const res = await request(app).get('/hdc/forms/eligible/1')

      const pdf = await pdfParse(res.body)
      const pdfText = pdf.text.replace(/([\t\n])/gm, ' ') // The extracted PDF text has newline and tab characters

      expect(pdfText).to.contain('Home detention curfew (tagging): eligible')
      expect(pdfText).to.contain('Name: Mark Andrews')
      expect(pdfText).to.contain('Location: HMP Albany')
      expect(pdfText).to.contain('Prison no: A5001DY')
      expect(pdfText).to.contain('Mark Andrews You are eligible for early release')
      expect(pdfText).to.contain('you could be released from prison on 23rd August 2019')
    })
  })

  describe('/forms/:bookingId/', () => {
    it('should throw if a non CA tries to access the page', () => {
      app = createApp('dmUser')

      return request(app)
        .get('/hdc/forms/1')
        .expect(403)
    })

    it('should list all forms with bookingId', () => {
      app = createApp('caUser')

      return request(app)
        .get('/hdc/forms/1')
        .expect('Content-Type', /html/)
        .expect(res => {
          expect(res.text).to.contain('href="/hdc/forms/eligible/1')
          expect(res.text).to.contain('href="/hdc/forms/approved/1')
          expect(res.text).to.contain('href="/hdc/forms/refused/1')
        })
    })
  })

  describe('/curfewAddress/:bookingId/', () => {
    it('calls the form service to get the data', () => {
      app = createApp('roUser')

      return request(app)
        .get('/hdc/forms/curfewAddress/1')
        .expect(200)
        .expect('Content-Type', 'application/pdf')
        .expect(res => {
          expect(Buffer.isBuffer(res.body)).to.equal(true)
        })
        .expect(() => {
          expect(formService.getCurfewAddressCheckData).to.be.calledOnce()
          expect(formService.getCurfewAddressCheckData).to.be.calledWith({
            agencyLocationId: '123',
            licence: licence.licence,
            isBass: false,
            isAp: false,
            bookingId: '1',
            token: 'system-token',
          })
        })
    })

    it('requests bass data when is bass', () => {
      const bassLicence = {
        licence: {
          bassReferral: { bassRequest: { bassRequested: 'Yes' } },
          proposedAddress: { addressProposed: { decision: 'No' } },
        },
        stage: 'DECIDED',
      }
      licenceService.getLicence = sinon.stub().resolves(bassLicence)
      app = createApp('roUser')

      return request(app)
        .get('/hdc/forms/curfewAddress/1')
        .expect(200)
        .expect('Content-Type', 'application/pdf')
        .expect(res => {
          expect(Buffer.isBuffer(res.body)).to.equal(true)
        })
        .expect(() => {
          expect(formService.getCurfewAddressCheckData).to.be.calledOnce()
          expect(formService.getCurfewAddressCheckData).to.be.calledWith({
            agencyLocationId: '123',
            licence: bassLicence.licence,
            isBass: true,
            isAp: false,
            bookingId: '1',
            token: 'system-token',
          })
        })
    })

    it('requests AP data when is AP', () => {
      const apLicence = { licence: { curfew: { approvedPremises: { required: 'Yes' } } }, stage: 'DECIDED' }
      licenceService.getLicence = sinon.stub().resolves(apLicence)
      app = createApp('roUser')

      return request(app)
        .get('/hdc/forms/curfewAddress/1')
        .expect(200)
        .expect('Content-Type', 'application/pdf')
        .expect(res => {
          expect(Buffer.isBuffer(res.body)).to.equal(true)
        })
        .expect(() => {
          expect(formService.getCurfewAddressCheckData).to.be.calledOnce()
          expect(formService.getCurfewAddressCheckData).to.be.calledWith({
            agencyLocationId: '123',
            licence: apLicence.licence,
            isBass: false,
            isAp: true,
            bookingId: '1',
            token: 'system-token',
          })
        })
    })

    it('should throw if a non RO tries to access the page', () => {
      app = createApp('caUser')

      return request(app)
        .get('/hdc/forms/curfewAddress/1')
        .expect(403)
    })

    it('Generates a PDF - hard to verify exactly but can at least check that some values appear in the output', async () => {
      app = createApp('roUser')

      const res = await request(app).get('/hdc/forms/curfewAddress/1')

      const pdf = await pdfParse(res.body)
      const pdfText = pdf.text.replace(/([\t\n])/gm, ' ') // The extracted PDF text has newline and tab characters

      expect(pdfText).to.contain('Home detention curfew - Address checks')
      expect(pdfText).to.contain('SurnameLAST')
      expect(pdfText).to.contain('Forename(s)FIRST MIDDLE')
      expect(pdfText).to.contain('DOB01/01/2001')
      expect(pdfText).to.contain('STANDARD CONDITION')
      expect(pdfText).to.contain('ADDITIONAL CONDITION')
    })
  })

  function createApp(user) {
    const signInService = createSignInServiceStub()
    const baseRouter = standardRouter({
      licenceService,
      prisonerService,
      authenticationMiddleware,
      signInService,
    })
    const route = baseRouter(createRoute({ formService }))
    return appSetup(route, user, '/hdc/forms')
  }
})
