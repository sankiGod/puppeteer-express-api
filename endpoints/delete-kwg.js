const fs = require('fs');
const path = require('path');
const chardet = require('chardet');
const csv = require('csv-parser');
const puppeteer = require('puppeteer');
const { navigateAndDeleteKWG } = require('../utils/puppeteer-delete-utils');

const MAX_RETRIES = 3;

const ERROR_CODES = {
  NON_UTF8_FILE: 'ERR_NON_UTF8_FILE',
  UNSUPPORTED_FILE: 'ERR_UNSUPPORTED_FILE',
  NON_EXISTENT_KW_GROUP: 'ERR_NON_EXISTENT_KW_GROUP',
  NAME_NOT_MATCH: 'ERR_NAME_NOT_MATCH',
};

const getErrorCode = (message) => {
  if (message.includes('Please provide a UTF-8 encoded file')) {
    return ERROR_CODES.NON_UTF8_FILE;
  }
  if (message.includes('The uploaded file is not a CSV file')) {
    return ERROR_CODES.UNSUPPORTED_FILE;
  }
  if (message.includes('Failed to navigate to the correct page')) {
    return ERROR_CODES.NON_EXISTENT_KW_GROUP;
  }
  if (message.includes('Failed to find or match the existing name for keyword group ID')) {
    return ERROR_CODES.NAME_NOT_MATCH;
  }
  return 'ERR_UNKNOWN';
};

module.exports = async (req, res) => {
  const logger = req.logger;
  const timestamp = new Date().toISOString().replace(/:/g, '-');

  logger.info('Received request to delete keyword group.');
  console.log('Received request to delete keyword group.');
  logger.info(`Request body: ${JSON.stringify(req.body)}`);
  console.log(`Request body: ${JSON.stringify(req.body)}`);
  logger.info(`Uploaded file: ${req.file.originalname}`);
  console.log(`Uploaded file: ${req.file.originalname}`);

  const { username, password, accountID, hierarchy } = req.body;
  const csvFileName = req.file.originalname;
  const csvFilePath = req.file.path;

  // Check if the file is a CSV file
  if (path.extname(csvFileName).toLowerCase() !== '.csv') {
    const errorMessage = 'The uploaded file is not a CSV file.';
    logger.error(errorMessage);
    return res.status(400).send({ error: errorMessage, code: getErrorCode(errorMessage) });
  }

  // Detect file encoding
  const originalEncoding = chardet.detectFileSync(csvFilePath);

  // If the file is not UTF-8 encoded, return a 400 response
  if (originalEncoding !== 'UTF-8') {
    const errorMessage = 'Uploaded file is not UTF-8 encoded.';
    logger.error(errorMessage);
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
          page.waitForNavigation(),
          page.click('#login_submit')
        ]);

        let errorEncountered = false;
        const baseUrl = page.url().match(/^https:\/\/[^/]+/)[0];
        const failedGroups = []; // Array to track failed keyword groups
        const successfulGroups = []; // Array to track successfully processed keyword groups

        for (const row of results) {
          const kgId = row[Object.keys(row)[0]];
          const kgName = row[Object.keys(row)[1]];

          let success = false;
          for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
              if (errorEncountered) break; // Break the loop if an error has occurred
              const newUrl = hierarchy.toUpperCase() === 'T' 
                ? `${baseUrl}/setup/keyword_groups_new_management/?param={"kg":${kgId}}`
                : `${baseUrl}/setup/keyword_management_edit_keyword_group/${kgId}`;
              await page.goto(`${baseUrl}/admin/edit_account_details/${accountID}`);
              await navigateAndDeleteKWG(page, newUrl, hierarchy.toUpperCase() === 'T', kgId, kgName, logger, getErrorCode);
              success = true;
              break;
            } catch (error) {
              const errorCode = getErrorCode(error.message);
              logger.error(`Attempt ${attempt + 1} failed for keyword group ID: ${kgId}`, error);
              console.log(`Attempt ${attempt + 1} failed for keyword group ID: ${kgId}`, error);
              if (errorCode === ERROR_CODES.NAME_NOT_MATCH) {
                logger.error(`Not retrying keyword group ID: ${kgId} due to error code: ${errorCode}`);
                console.log(`Not retrying keyword group ID: ${kgId} due to error code: ${errorCode}`);
                failedGroups.push({ kgId, reason: error.message, errorCode });
                break; // Do not retry if the error is due to name mismatch
              }
              if (attempt === MAX_RETRIES - 1) {
                const message = `Failed to process keyword group ID: ${kgId} after ${MAX_RETRIES} attempts. Possible Cause: Wrong Account ID or Incorrect Hierarchy given.`;
                logger.error(message);
                console.log(message);
                failedGroups.push({ kgId, reason: message, errorCode: getErrorCode(message) });
              }
            }
          }
          if (success) {
            logger.info(`Deleted keyword group ID: ${kgId}`);
            successfulGroups.push({ kgId });
          }
        }

        const responseMessage = {
          message: 'Keyword group delete process completed.',
          failedGroups: failedGroups,
          successfulGroups: successfulGroups
        };

        if (!errorEncountered && failedGroups.length === 0) {
          res.json(responseMessage);
        } else {
          res.status(200).json(responseMessage);
        }
        const completionMessage = 'Keyword group rename process completed.';
        logger.info(completionMessage);
        console.log(completionMessage);
      } catch (error) {
        logger.error('An error occurred:', error);
        res.status(500).send('An error occurred while processing the request.');
      } finally {
        await browser.close();
      }
    });
};
