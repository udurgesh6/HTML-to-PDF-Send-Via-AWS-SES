const express = require("express");
const AWS = require("aws-sdk");
const cors = require("cors");
const bodyParser = require("body-parser");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const { fromString } = require("./node_modules/html-to-text/lib/html-to-text");

require("dotenv").config();

AWS.config.update({
  region: process.env.awsregion,
  credentials: {
    accessKeyId: process.env.accessKeyId,
    secretAccessKey: process.env.secretAccessKey,
  },
});
const ses = new AWS.SES({ region: process.env.awsregion });

const PORT = process.env.PORT || 8087;
const allowedOrigins = ["http://localhost:3000"];
const corsOptions = {
  origin: function (origin, callback) {
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
};

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static("."));
app.use(cors(corsOptions));

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}.`);
});

async function sendEmail(pdfPath, email) {
  const pdfBytes = fs.readFileSync(pdfPath);
  const boundary = "boundary_" + Math.random().toString(16).substr(2);
  const message = `MIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\nHere is the survey report you requested\r\n\r\n--${boundary}\r\nContent-Type: application/pdf\r\nContent-Disposition: attachment; filename=report.pdf\r\nContent-Transfer-Encoding: base64\r\n\r\n${pdfBytes.toString(
    "base64"
  )}\r\n\r\n--${boundary}--`;

  const params = {
    RawMessage: {
      Data: message,
    },
    Destinations: [email], // Replace with your recipient email address
    Source: "support@happyagility.com", // Replace with your sender email address
  };

  params.RawMessage.Data = `Subject: Survey Report\n${params.RawMessage.Data}`;

  try {
    const result = await ses.sendRawEmail(params).promise();
    res.sendStatus(200);
  } catch (error) {
    console.log("Sending error", error);
    res.send(error);
  }
}

app.post("/generate_and_send_pdf", function (req, res) {
  try {
    const htmlContent = `<!DOCTYPE html>
              <html>
                <head>
                  <meta charset="UTF-8">
                  <title>My Report</title>
                </head>
                <body>
                  <h2>Summary</h2>
                  <p>${req.body.text}</p>
                </body>
              </html>`;
    // Create a new PDF document
    const doc = new PDFDocument();
    // Convert the HTML content to plain text and add it to the PDF document
    const text = fromString(htmlContent);
    doc.text(text);
    try {
      const stream = fs.createWriteStream("/tmp/output.pdf");
      doc.pipe(stream);
      doc.end();
      stream.on("finish", () => {
        sendEmail("/tmp/output.pdf", req.body.email);
      });
      stream.on("error", (err) => {
        res.send(err);
      });
    } catch (error) {
      res.send(error);
    }
  } catch (err) {
    res.send(err);
  }
});
