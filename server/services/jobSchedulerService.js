const schedule = require('node-schedule')
const moment = require('moment')
const config = require('../config')
const logger = require('../../log.js')
const createJobUtils = require('./jobs/jobUtils')

module.exports = function createJobSchedulerService(
  dbLockingClient,
  configClient,
  notificationJobs,
  scheduleJob = schedule.scheduleJob
) {
  const { autostart, overlapTimeout } = config.jobs

  const jobUtils = createJobUtils(dbLockingClient)

  function jobResultCallback(name) {
    return (error, result) => {
      if (error) {
        logger.warn(`Scheduled job: ${name}, finished with error`, error)
        outcomes[name] = { success: false, output: error.message }
        return
      }
      logger.info(`Scheduled job: ${name}, finished with success`, result)
      outcomes[name] = { success: true, output: JSON.stringify(result) }
    }
  }

  const jobs = [
    {
      name: 'roReminders',
      function: jobUtils.onceOnly(
        notificationJobs.roReminders,
        'roReminders',
        overlapTimeout,
        jobResultCallback('roReminders')
      ),
    },
  ]

  const executions = {}
  const outcomes = {}

  function nextExecution(job) {
    if (!job) {
      return null
    }
    const next = job.nextInvocation()
    return next ? moment(next.toDate()).format('dddd Do MMMM HH:mm:ss') : null
  }

  async function listJobs() {
    return Promise.all(
      jobs.map(async (job) => {
        const spec = await configClient.getJobSpec(job.name)
        return {
          name: job.name,
          schedule: spec,
          next: nextExecution(executions[job.name]),
          outcome: outcomes[job.name],
        }
      })
    )
  }

  function cancelJob(jobName) {
    const job = jobs.find((j) => j.name === jobName)
    if (job) {
      logger.info(`Cancelling job: ${job.name}`)
      const execution = executions[job.name]
      if (execution) {
        execution.cancel()
      }
    }
  }

  function cancelAllJobs() {
    jobs.forEach((job) => {
      logger.info(`Cancelling job: ${job.name}`)
      executions[job.name].cancel()
    })
  }

  function startAllJobs() {
    return Promise.all(
      jobs.map((job) => {
        return activate(job)
      })
    )
  }

  function startJob(jobName) {
    const job = jobs.find((j) => j.name === jobName)
    if (job) {
      try {
        return activate(job)
      } catch (error) {
        logger.error(`Error starting ${job.name}`, error)
      }
    }
    return null
  }

  async function activate(job) {
    logger.info(`Scheduling job: ${job.name}`)
    const spec = await configClient.getJobSpec(job.name)
    if (executions[job.name]) {
      executions[job.name].reschedule(spec)
    } else {
      executions[job.name] = scheduleJob(job.name, spec, job.function)
    }
  }

  async function updateJob(jobName, newSchedule) {
    const job = jobs.find((j) => j.name === jobName)
    if (job) {
      cancelJob(jobName)
      await configClient.setJobSpec(job.name, newSchedule)
      logger.info(`Updated: ${job.name} with new schedule: ${newSchedule}`)
    }
  }

  if (autostart) {
    logger.info('Auto-starting scheduled jobs')
    startAllJobs()
  }

  return {
    listJobs,
    startAllJobs,
    startJob,
    cancelAllJobs,
    cancelJob,
    updateJob,
  }
}
