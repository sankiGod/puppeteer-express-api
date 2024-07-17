const fs = require('fs');
const path = require('path');
const chardet = require('chardet');
const csv = require('csv-parser');
const puppeteer = require('puppeteer');
const { navigateAndEditRenamePgGrp } = require('../utils/puppeteer-rename-utils');

const MAX_RETRIES = 3;

const ERROR_CODES = {
  NON_UTF8_FILE: 'ERR_NON_UTF8_FILE',
  UNSUPPORTED_FILE: 'ERR_UNSUPPORTED_FILE',
  NON_EXISTENT_PG_GROUP: 'ERR_NON_EXISTENT_PG_GROUP',
  CREATE_PG_GROUP_FAIL: 'ERR_CREATE_PG_GROUP_FAIL',
  EXTRA_SPACE_IN_FIELD: 'ERR_EXTRA_SPACE_IN_FIELD',
};

const getErrorCode = (message) => {
  if (message.includes('Please provide a UTF-8 encoded file')) {
    return ERROR_CODES.NON_UTF8_FILE;
  }
  if (message.includes('The uploaded file is not a CSV file')) {
    return ERROR_CODES.UNSUPPORTED_FILE;
  }
  if (message.includes('Failed to navigate to the correct page')) {
    return ERROR_CODES.NON_EXISTENT_PG_GROUP;
  }
  if (message.includes('Please review this page group name and remove any trailing spaces')) {
    return ERROR_CODES.EXTRA_SPACE_IN_FIELD;
  }
  return 'ERR_UNKNOWN';
};

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
    const errorMessage = 'The uploaded file is not a CSV file.';
    logger.error(errorMessage);
    console.log(errorMessage);
    return res.status(400).send({ error: errorMessage, code: getErrorCode(errorMessage) });
  }

  // Detect file encoding
  const originalEncoding = chardet.detectFileSync(csvFilePath);

  // If the file is not UTF-8 encoded, return a 400 response
  if (originalEncoding !== 'UTF-8') {
    const errorMessage = 'Uploaded file is not UTF-8 encoded.';
    logger.error(errorMessage);
    console.log(errorMessage);
    return res.status(400).send({ error: errorMessage, code: getErrorCode(errorMessage) });
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

        const baseUrl = page.url().match(/^https:\/\/[^/]+/)[0];
        const failedGroups = []; // Array to track failed page groups
        const successfulGroups = []; // Array to track successfully processed page groups

        await page.goto(`${baseUrl}/admin/edit_account_details/${accountID}`);

        for (const row of results) {
          const PageGrpID = row[Object.keys(row)[0]];
          const newName = row[Object.keys(row)[2]];

          // Check for trailing spaces in the newName
          if (newName.trim().length !== newName.length) {
            const errorMessage = `Please review this page group name and remove any trailing spaces: ${newName} (Page Group ID: ${PageGrpID})`;
            logger.warn(errorMessage);
            failedGroups.push({ PageGrpID, reason: errorMessage, code: getErrorCode(errorMessage) });
            continue;
          }

          let success = false;
          for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
              const paramValue = JSON.stringify({ pt: PageGrpID });
              const encodedParamValue = encodeURIComponent(paramValue);
              const newUrl = `${baseUrl}/setup/create_page_group/?param=${encodedParamValue}`;
              await navigateAndEditRenamePgGrp(page, newUrl, newName, PageGrpID, logger, getErrorCode);
              success = true;
              break;
            } catch (error) {
              logger.error(`Attempt ${attempt + 1} failed for page group ID: ${PageGrpID}`, error);
              console.log(`Attempt ${attempt + 1} failed for page group ID: ${PageGrpID}`, error);
              if (attempt === MAX_RETRIES - 1) {
                const errorMessage = `Failed to process page group ID: ${PageGrpID} after ${MAX_RETRIES} attempts. Possible Causes: Incorrect Account ID or Page group ID not found.`;
                logger.error(errorMessage);
                failedGroups.push({ PageGrpID, reason: errorMessage, code: getErrorCode(errorMessage) });
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

        res.json(responseMessage);
      } catch (error) {
        logger.error('An error occurred:', error);
        res.status(500).send('An error occurred while processing the request.');
      } finally {
        await browser.close();
      }
    });
};
