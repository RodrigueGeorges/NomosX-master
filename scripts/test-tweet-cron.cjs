const fs = require("fs");
const http = require("http");

const lines = fs.readFileSync(".env", "utf8").split("\n");
const line = lines.find((l) => l.startsWith("CRON_SECRET="));
const secret = line.split("=")[1].replace(/["']/g, "").trim();

const req = http.request(
  {
    hostname: "localhost",
    port: 3000,
    path: "/api/cron/tweet-publications",
    method: "POST",
    headers: { authorization: "Bearer " + secret },
  },
  (r) => {
    let d = "";
    r.on("data", (c) => (d += c));
    r.on("end", () => {
      console.log("tweet cron:", r.statusCode, d.slice(0, 300));
      process.exit();
    });
  }
);
req.end();
