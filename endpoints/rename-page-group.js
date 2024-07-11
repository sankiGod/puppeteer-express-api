const fs = require('fs');
const path = require('path');
const chardet = require('chardet');
const csv = require('csv-parser');
const puppeteer = require('puppeteer');
const { navigateAndEditRenamePgGrp } = require('../utils/puppeteer-rename-utils');

const MAX_RETRIES = 3;

module.exports = async (req, res) => {
  const logger = req.logger;

  logger.info('Received request to rename page group.');
  console.log('Received request to rename page group.');
  logger.info(`Request body: ${JSON.stringify(req.body)}`);
  console.log(`Request body: ${JSON.stringify(req.body)}`);
  logger.info(`Uploaded file: ${req.file.originalname}`);
  console.log(`Uploaded file: ${req.file.originalname}`);

  const { username, password, accountID } = req.body;
  const csvFileName = req.file.originalname;
  const csvFilePath = req.file.path;

  // Check if the file is a CSV file
  if (path.extname(csvFileName).toLowerCase() !== '.csv') {
    logger.error('The uploaded file is not a CSV file.');
    console.log('The uploaded file is not a CSV file.');
    return res.status(400).send('The uploaded file is not a CSV file.');
  }

  // Detect file encoding
  const originalEncoding = chardet.detectFileSync(csvFilePath);

  // If the file is not UTF-8 encoded, return a 400 response
  if (originalEncoding !== 'UTF-8') {
    logger.error('Uploaded file is not UTF-8 encoded.');
    console.log('Uploaded file is not UTF-8 encoded.');
    return res.status(400).send('Please provide a UTF-8 encoded file.');
  }

  const results = [];
  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (row) => {
      results.push(row);
    })
    .on('end', async () => {
      const browser = await puppeteer.launch({ headless: false, defaultViewport: { width: 1280, height: 720 } });
      const page = await browser.newPage();

      try {
        await page.goto('https://www.brightedge.com/secure/login');
        await page.type('#UserLogin', username);
        await page.type('#UserPassword', password);

        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2' }),
          page.click('#login_submit')
        ]);

        let errorEncountered = false;
        const currentUrl = page.url();
        const baseUrl = currentUrl.match(/^https:\/\/[^/]+/)[0];

        await page.goto(`${baseUrl}/admin/edit_account_details/${accountID}`);

        const failedGroups = []; // Array to track failed page groups
        const successfulGroups = []; // Array to track successfully processed page groups

        for (const row of results) {
          const PageGrpID = row[Object.keys(row)[0]];
          const newName = row[Object.keys(row)[2]];

          // Check for trailing spaces in the newName
          if (newName.trim().length !== newName.length) {
            logger.warn(`Please review this page group name and remove any trailing spaces: ${newName} (Page Group ID: ${PageGrpID})`);
            failedGroups.push({ PageGrpID, reason: 'Trailing spaces in the name' });
            continue;
          }

          let success = false;
          for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
              const paramValue = JSON.stringify({ pt: PageGrpID });
              const encodedParamValue = encodeURIComponent(paramValue);
              const newUrl = `${baseUrl}/setup/create_page_group/?param=${encodedParamValue}`;
              await navigateAndEditRenamePgGrp(page, newUrl, newName, PageGrpID, logger);
              success = true;
              break;
            } catch (error) {
              logger.error(`Attempt ${attempt + 1} failed for page group ID: ${PageGrpID}`, error);
              console.log(`Attempt ${attempt + 1} failed for page group ID: ${PageGrpID}`, error);
              if (attempt === MAX_RETRIES - 1) {
                logger.error(`Failed to process page group ID: ${PageGrpID} after ${MAX_RETRIES} attempts. Possible Causes: Incorrect Account ID or Page group ID not found.`);
                errorEncountered = true; // Set the flag to true if the error is encountered
                failedGroups.push({ PageGrpID, reason: error.message });
              }
            }
          }
          if (success) {
            logger.info(`Processed Page group ID: ${PageGrpID} with new name: ${newName}`);
            console.log(`Processed Page group ID: ${PageGrpID} with new name: ${newName}`);
            successfulGroups.push({ PageGrpID, newName });
          }
        }

        const responseMessage = {
          message: 'Page group rename process completed.',
          failedGroups: failedGroups,
          successfulGroups: successfulGroups
        };

        const completionMessage = `Page group rename process completed.`;
        logger.info(completionMessage);
        console.log(completionMessage); // Log to console

        if (!errorEncountered && failedGroups.length === 0) {
          res.json(responseMessage);
        } else {
          res.status(200).json(responseMessage);
        }
      } catch (error) {
        logger.error('An error occurred:', error);
        res.status(500).send('An error occurred while processing the request.');
      } finally {
        await browser.close();
      }
    });
};
