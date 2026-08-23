import { createApp } from './app.js';
import { env } from './config/env.js';
import { startAttendanceCleanupJob } from './jobs/attendanceCleanupJob.js';
import { startAutoCloseDayJob } from './jobs/autoCloseDayJob.js';

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`Cleopatra API listening on port ${env.PORT} (${env.NODE_ENV})`);
});

startAttendanceCleanupJob();
startAutoCloseDayJob();
