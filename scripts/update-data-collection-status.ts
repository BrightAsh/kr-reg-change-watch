import { writeDataCollectionStatusReport } from "../lib/dataCollectionStatus";

writeDataCollectionStatusReport()
  .then((report) => {
    console.log(
      `Data collection status updated for ${report.start_date} to ${report.end_date}. ` +
        `Complete ${report.summary.complete}, partial ${report.summary.partial}, failed ${report.summary.failed}.`
    );
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
