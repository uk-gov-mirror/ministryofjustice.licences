const { asyncMiddleware } = require('../utils/middleware')
const { getIn } = require('../utils/functionalHelpers')
const { isAdminRole } = require('../authentication/roles')

module.exports = ({ userService }) => (router) => {
  router.get(
    '/',
    asyncMiddleware(async (req, res) => {
      const [{ roles }, allCaseLoads] = await Promise.all([
        userService.getAllRoles(req.user.token),
        userService.getAllCaseLoads(req.user, res.locals.token),
      ])

      res.render(`user/admin`, { allRoles: roles, allCaseLoads, user: req.user, isAdmin: isAdminRole(req.user.role) })
    })
  )

  router.post(
    '/',
    asyncMiddleware(async (req, res) => {
      if (req.body.role !== req.user.role) {
        await userService.setRole(req.body.role, req.user)
      }

      const caseLoadId = getIn(req, ['body', 'caseLoadId'])

      if (caseLoadId && caseLoadId !== req.user.activeCaseLoadId) {
        await userService.setActiveCaseLoad(caseLoadId, req.user, res.locals.token)
      }

      res.redirect('/')
    })
  )

  return router
}
