const { asyncMiddleware, authorisationMiddleware } = require('../../utils/middleware')
const { firstItem } = require('../../utils/functionalHelpers')

module.exports = ({ userAdminService }) => (router, audited) => {
  router.use(authorisationMiddleware)

  router.get(
    '/',
    asyncMiddleware(async (req, res) => {
      const roUsers = await userAdminService.getRoUsers()
      return res.render('admin/users/list', { roUsers, heading: 'RO users' })
    })
  )

  router.post(
    '/',
    asyncMiddleware(async (req, res) => {
      const { searchTerm } = req.body

      if (!searchTerm || searchTerm.trim() === '') {
        return res.redirect('/admin/roUsers')
      }

      const roUsers = await userAdminService.findRoUsers(searchTerm)

      return res.render('admin/users/list', { roUsers, heading: 'Search results' })
    })
  )

  router.get(
    '/edit/:nomisId',
    asyncMiddleware(async (req, res) => {
      const { nomisId } = req.params
      const roUser = await userAdminService.getRoUser(nomisId)
      const errors = firstItem(req.flash('errors')) || {}
      const userInput = firstItem(req.flash('userInput')) || null

      return res.render('admin/users/roUserDetails', { roUser, errors, userInput })
    })
  )

  router.post('/edit/:originalNomisId', audited, async (req, res) => {
    const { originalNomisId } = req.params
    const userInput = req.body

    const error = validateIdentifiers(userInput)
    if (error) {
      req.flash('errors', error)
      req.flash('userInput', userInput)
      return res.redirect(`/admin/roUsers/edit/${originalNomisId}`)
    }

    try {
      await userAdminService.updateRoUser(res.locals.token, originalNomisId, userInput)
    } catch (apiError) {
      req.flash('errors', { nomisId: apiError.message })
      req.flash('userInput', userInput)
      return res.redirect(`/admin/roUsers/edit/${originalNomisId}`)
    }

    res.redirect('/admin/roUsers')
  })

  router.get(
    '/delete/:nomisId',
    asyncMiddleware(async (req, res) => {
      const { nomisId } = req.params
      const roUser = await userAdminService.getRoUser(nomisId)
      return res.render('admin/users/delete', { roUser })
    })
  )

  router.post(
    '/delete/:nomisId',
    audited,
    asyncMiddleware(async (req, res) => {
      const { nomisId } = req.params
      await userAdminService.deleteRoUser(nomisId)
      res.redirect('/admin/roUsers')
    })
  )

  router.get('/verify/', audited, async (req, res) => {
    const { nomisUserName } = req.query

    try {
      const userInfo = await userAdminService.verifyUserDetails(res.locals.token, nomisUserName)
      return res.json(userInfo)
    } catch (error) {
      return res.status(404).json('not found')
    }
  })

  router.get('/add', async (req, res) => {
    const errors = firstItem(req.flash('errors')) || {}
    const userInput = firstItem(req.flash('userInput')) || null

    return res.render('admin/users/roUserDetails', { errors, userInput })
  })

  router.post('/add', audited, async (req, res) => {
    const userInput = req.body

    const error = validateIdentifiers(userInput)
    if (error) {
      req.flash('errors', error)
      req.flash('userInput', userInput)
      return res.redirect('/admin/roUsers/add')
    }

    try {
      await userAdminService.addRoUser(res.locals.token, userInput)
      return res.redirect('/admin/roUsers')
    } catch (apiError) {
      req.flash('errors', { nomisId: apiError.message })
      req.flash('userInput', userInput)
      return res.redirect('/admin/roUsers/add')
    }
  })

  function validateIdentifiers(userInput) {
    if (!userInput.nomisId || userInput.nomisId.trim() === '') {
      return { nomisId: 'Nomis id is required' }
    }
    if (!userInput.deliusId || userInput.deliusId.trim() === '') {
      return { deliusId: 'Delius staff id is required' }
    }
  }

  router.get(
    '/incomplete',
    asyncMiddleware(async (req, res) => {
      const incompleteUsers = await userAdminService.getIncompleteRoUsers(res.locals.token)
      return res.render('admin/users/incompleteList', { incompleteUsers })
    })
  )

  router.post('/incomplete/add', async (req, res) => {
    try {
      const input = req.body.incompleteUser
      const userInput = JSON.parse(input)
      req.flash('userInput', userInput)

      return res.redirect('/admin/roUsers/add')
    } catch (error) {
      return res.redirect('/admin/roUsers/incomplete')
    }
  })

  return router
}