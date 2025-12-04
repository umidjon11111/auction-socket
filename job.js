const { CronJob } = require("cron");
const https = require("https");

const job = new CronJob("*/14 * * * *", function start() {
  https
    .get(process.env.API_URL, (res) => {
      if (res.statusCode === 200) {
        console.log("GET request sent successfully");
      } else {
        console.log("GET request failed", res.statusCode);
      }
    })
    .on("error", (e) => console.error("Error while sending request", e));
});

module.exports = job; // <-- bu yerda job ni default export qilyapsan
