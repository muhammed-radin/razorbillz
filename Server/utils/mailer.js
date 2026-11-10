import nodemailer from "nodemailer";
import ejs from "ejs";
import path from "path";
import { fileURLToPath } from "url";
import storeConfig from "../shared/store.config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mailRetryLimit = 3; // Number of retries for sending email

const transportConfig = {
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: process.env.SMTP_PORT || 587,
  secure: parseInt(process.env.SMTP_PORT) == 465, // true for 465, false for others
  auth: {
    user: storeConfig.contact.email.support, // Your email address
    pass: process.env.EMAIL_PASS,
  },
  pool: true, // Keep connections open
  maxConnections: 5,
  maxMessages: 100,
  family: 4, // Use IPv4
};

// 1. Create reusable transporter (Singleton)
const transporter = nodemailer.createTransport(transportConfig);

function verifyTransporter(debug = true) {
  if (debug) {
    console.log("🔍 Verifying email transporter...");
  }
  transporter.verify((error, success) => {
    if (error) {
      if (debug) console.error("❌ Email Transporter Error:", error);
      if (error.code === "ETIMEDOUT") {
        if (debug)
          console.error("Retrying transporter verification in 1 seconds...");
        setTimeout(verifyTransporter, 1000); // Retry after 1 seconds
      }
    } else {
      if (debug) console.log("✅ Email Transporter is ready to send messages");
    }

    if (success && debug) {
      console.log("✅ Email Transporter verified successfully");
    }
  });
}

/**
 * Advanced Email Sender
 * @param {Object} options - Email options
 * @param {string} options.email - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.templateName - Filename of EJS template (e.g., "welcome.ejs")
 * @param {Object} options.variables - Data to inject into the template (e.g., { name: "John" })
 * @param {Array} [options.attachments] - Optional array of attachment objects
 */
const sendEmail = async ({
  email,
  subject,
  templateName,
  variables,
  attachments = [],
  debug = false,
  retry = true, // Whether to retry on failure
}) => {
  let retryCount = 0;
  try {
    // 2. Locate the template file
    const templatePath = path.join(__dirname, "../templates", templateName);
    if (debug) {
      console.log(`📄 Rendering template: ${templatePath}`);
      console.log(`🔧 Variables:`, variables);
    }

    // 3. Render the HTML with EJS
    const html = await ejs.renderFile(templatePath, variables);

    if (debug) {
      console.log(`📧 Email HTML Success`);
    }

    // 4. Define mail options
    const mailOptions = {
      from: `"${storeConfig.brand.name.en}" <${storeConfig.contact.email.support}>`, // Sender address
      to: email,
      subject: subject,
      html: html,
      attachments: attachments, // Attachments array
    };

    if (debug) {
      console.log(`📧 Mail Options:`, mailOptions);
    }

    // 5. Send Email
    const info = await transporter.sendMail(mailOptions);
    console.log(`📩 Email sent: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Email Error:", error);
    // You could add logic here to retry sending or log to a database
    if (retryCount < mailRetryLimit && retry == true) {
      retryCount++;
      console.log(`🔄 Retrying email send (attempt ${retryCount})...`);
      return await sendEmail({
        email,
        subject,
        templateName,
        variables,
        attachments,
        debug,
        retry: false, // Prevent infinite retry loop
      });
    }
    // Retry

    return new Error("Email sending failed");
  }
};

export default sendEmail;
