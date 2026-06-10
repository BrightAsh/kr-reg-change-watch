import { writeCollectionStatusReport } from "../lib/collectionStatus";

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const report = await writeCollectionStatusReport();

  console.log(
    `Collection status updated for ${report.start_date} to ${report.end_date}. ` +
      `Complete: ${report.summary.complete}, partial: ${report.summary.partial}, ` +
      `failed: ${report.summary.failed}, not started: ${report.summary.not_started}.`
  );
}
