const request = require('supertest');

const {
    loggerStub,
    pdfServiceStub,
    authenticationMiddleware,
    appSetup,
    auditStub,
    createPrisonerServiceStub,
    createLicenceServiceStub
} = require('../supertestSetup');

const createPdfRoute = require('../../server/routes/pdf');

const prisonerService = createPrisonerServiceStub();
const licenceService = createLicenceServiceStub();
const pdfRoute = createPdfRoute({
    logger: loggerStub,
    pdfService: pdfServiceStub,
    authenticationMiddleware,
    audit: auditStub,
    prisonerService,
    licenceService
});
let app;

const valuesWithMissing = {
    values: {
        OFF_NAME: 'FIRST LAST'
    },
    missing: {
        reporting:
            {mandatory: {REPORTING_AT: 'reporting date'}}
    }
};

const valuesWithoutMissing = {
    values: {
        OFF_NAME: 'FIRST LAST'
    },
    missing: {}
};

describe('PDF:', () => {

    beforeEach(() => {
        app = appSetup(pdfRoute, 'caUser', '/hdc/pdf/');
        auditStub.record.reset();
        pdfServiceStub.getPdfLicenceData.reset();
        licenceService.getLicence.resolves({licence: {key: 'value'}});
    });

    describe('GET /select', () => {

        it('renders dropdown containing licence types', () => {
            return request(app)
                .get('/hdc/pdf/select/123')
                .expect(200)
                .expect('Content-Type', /html/)
                .expect(res => {
                    expect(res.text).to.include('<option value="hdc_ap_pss">AP PSS HDC Licence</option>');
                    expect(res.text).to.include('<option value="hdc_yn">HDC Young Person\'s Licence</option>');
                    expect(res.text).to.include('<option value="hdc_ap">AP HDC Licence</option>');
                    expect(res.text).to.include('<option value="hdc_pss">HDC PSS Notice of Supervision</option>');
                });
        });

        it('defaults to type used in last approved version', () => {

            licenceService.getLicence.resolves({approvedVersion: {template: 'hdc_ap'}});

            return request(app)
                .get('/hdc/pdf/select/123')
                .expect(200)
                .expect('Content-Type', /html/)
                .expect(res => {
                    expect(res.text).to.include('<option value="hdc_ap_pss">AP PSS HDC Licence</option>');
                    expect(res.text).to.include('<option value="hdc_yn">HDC Young Person\'s Licence</option>');
                    expect(res.text).to.include('<option value="hdc_ap" selected>AP HDC Licence</option>');
                    expect(res.text).to.include('<option value="hdc_pss">HDC PSS Notice of Supervision</option>');
                });
        });

        it('should throw if a non ca tries to access the page', () => {
            app = appSetup(pdfRoute, 'roUser', '/hdc/pdf');

            licenceService.getLicence.resolves({approvedVersion: {template: 'hdc_ap'}});

            return request(app)
                .get('/hdc/pdf/select/123')
                .expect(403);
        });
    });

    describe('POST /select', () => {

        it('redirects to the page of the selected pdf', () => {
            return request(app)
                .post('/hdc/pdf/select/123')
                .send({decision: 'hdc_ap_pss'})
                .expect(302)
                .expect('Location', '/hdc/pdf/taskList/hdc_ap_pss/123');
        });

        it('redirects back to the select page if nothing selected', () => {
            return request(app)
                .post('/hdc/pdf/select/123')
                .send({decision: ''})
                .expect(302)
                .expect('Location', '/hdc/pdf/select/123');
        });

        it('should throw if a non ca tries to post to the route', () => {
            app = appSetup(pdfRoute, 'roUser', '/hdc/pdf');

            return request(app)
                .post('/hdc/pdf/select/123')
                .send({decision: ''})
                .expect(403);
        });
    });

    describe('GET /tasklist', () => {

        it('Shows incomplete tasks when missing values', () => {

            pdfServiceStub.getPdfLicenceData.resolves(valuesWithMissing);

            return request(app)
                .get('/hdc/pdf/taskList/hdc_ap_pss/123')
                .expect(200)
                .expect('Content-Type', /html/)
                .expect(res => {
                    expect(res.text).to.include('Not complete');
                    expect(pdfServiceStub.getPdfLicenceData).to.be.calledOnce();
                    expect(pdfServiceStub.getPdfLicenceData).to.be.calledWith(
                        'hdc_ap_pss', '123', {licence: {key: 'value'}}, 'token');
                });
        });


        it('Does not allow print when missing values', () => {

            pdfServiceStub.getPdfLicenceData.resolves(valuesWithMissing);

            return request(app)
                .get('/hdc/pdf/taskList/hdc_ap_pss/123')
                .expect(200)
                .expect('Content-Type', /html/)
                .expect(res => {
                    expect(res.text).not.to.include('Ready to create');
                    expect(pdfServiceStub.getPdfLicenceData).to.be.calledOnce();
                    expect(pdfServiceStub.getPdfLicenceData).to.be.calledWith(
                        'hdc_ap_pss', '123', {licence: {key: 'value'}}, 'token');
                });
        });

        it('Shows template version info - same version when same template', () => {

            pdfServiceStub.getPdfLicenceData.resolves(valuesWithoutMissing);

            licenceService.getLicence.resolves({
                version: 1,
                approvedVersion: {template: 'hdc_ap', version: 1, timestamp: '11/12/13'}
            });

            return request(app)
                .get('/hdc/pdf/taskList/hdc_ap/123')
                .expect(200)
                .expect('Content-Type', /html/)
                .expect(res => {
                    expect(res.text).to.include('Ready to print');
                    expect(res.text).to.include('Last printed version 1, AP HDC Licence, on 11/12/13');
                });
        });

        it('Shows template version info - new version when new template', () => {

            pdfServiceStub.getPdfLicenceData.resolves(valuesWithoutMissing);

            licenceService.getLicence.resolves({
                version: 1,
                approvedVersion: {template: 'hdc_ap', version: 1, timestamp: '11/12/13'}
            });

            return request(app)
                .get('/hdc/pdf/taskList/hdc_ap_pss/123')
                .expect(200)
                .expect('Content-Type', /html/)
                .expect(res => {
                    expect(res.text).to.include('Ready to print version 2');
                    expect(res.text).to.include('AP PSS HDC Licence');
                    expect(res.text).to.include('Last printed version 1');
                    expect(res.text).to.include('AP HDC Licence');
                    expect(res.text).to.include('on 11/12/13');
                });
        });

        it('Shows template version info - new version when modified licence version', () => {

            pdfServiceStub.getPdfLicenceData.resolves(valuesWithoutMissing);

            licenceService.getLicence.resolves({
                version: 2,
                approvedVersion: {template: 'hdc_ap', version: 1, timestamp: '11/12/13'}
            });

            return request(app)
                .get('/hdc/pdf/taskList/hdc_ap/123')
                .expect(200)
                .expect('Content-Type', /html/)
                .expect(res => {
                    expect(res.text).to.include('Ready to print version 2');
                    expect(res.text).to.include('Last printed version 1, AP HDC Licence, on 11/12/13');
                });
        });

        it('should throw if a non ca tries to access the tasklist', () => {
            app = appSetup(pdfRoute, 'roUser', '/hdc/pdf');

            pdfServiceStub.getPdfLicenceData.resolves(valuesWithoutMissing);

            licenceService.getLicence.resolves({
                version: 2,
                approvedVersion: {template: 'hdc_ap', version: 1, timestamp: '11/12/13'}
            });

            return request(app)
                .get('/hdc/pdf/taskList/hdc_ap/123')
                .expect(403);

        });
    });

    describe('GET /create', () => {

        it('Calls pdf service and renders response as PDF', () => {

            const pdf1AsBytes = Buffer.from([80, 68, 70, 45, 49]);
            pdfServiceStub.generatePdf.resolves(pdf1AsBytes);

            return request(app)
                .get('/hdc/pdf/create/hdc_ap_pss/123')
                .expect(200)
                .expect('Content-Type', 'application/pdf')
                .expect(res => {
                    expect(pdfServiceStub.generatePdf).to.be.calledOnce();
                    expect(pdfServiceStub.generatePdf).to.be.calledWith(
                        'hdc_ap_pss', '123', {licence: {key: 'value'}});
                    expect(res.body.toString()).to.include('PDF-1');
                });
        });

        it('Audits the PDF creation event', () => {

            const pdf1AsBytes = Buffer.from([80, 68, 70, 45, 49]);
            pdfServiceStub.generatePdf.resolves(pdf1AsBytes);

            return request(app)
                .get('/hdc/pdf/create/hdc_ap_pss/123')
                .expect(200)
                .expect('Content-Type', 'application/pdf')
                .expect(res => {
                    expect(auditStub.record).to.be.calledOnce();
                    expect(auditStub.record).to.be.calledWith(
                        'CREATE_PDF', 'id', {nomisId: '123', templateName: 'hdc_ap_pss'});
                });
        });

        it('should throw if a non ca tries to create the pdf', () => {
            app = appSetup(pdfRoute, 'roUser', '/hdc/pdf');

            const pdf1AsBytes = Buffer.from([80, 68, 70, 45, 49]);
            pdfServiceStub.generatePdf.resolves(pdf1AsBytes);

            return request(app)
                .get('/hdc/pdf/create/hdc_ap_pss/123')
                .expect(403);
        });
    });

});

