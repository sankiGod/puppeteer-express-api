const fs = require('fs');
const path = require('path');
const chardet = require('chardet');
const csv = require('csv-parser');
const puppeteer = require('puppeteer');
const { navigateAndEditRenameKWG } = require('../utils/puppeteer-rename-utils');

const MAX_RETRIES = 3;

const ERROR_CODES = {
  NON_UTF8_FILE: 'ERR_NON_UTF8_FILE',
  UNSUPPORTED_FILE: 'ERR_UNSUPPORTED_FILE',
  NON_EXISTENT_KW_GROUP: 'ERR_NON_EXISTENT_KW_GROUP',
  CREATE_KW_GROUP_FAIL: 'ERR_CREATE_KW_GROUP_FAIL',
  SAME_NAME_KW_GROUP: 'ERR_SAME_NAME_KW_GROUP',
  CASE_SENSITIVITY_ISSUE: 'ERR_CASE_SENSITIVITY',
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
    return ERROR_CODES.NON_EXISTENT_KW_GROUP;
  }
  if (message.includes('Sorry, we could not create keyword group')) {
    return ERROR_CODES.CASE_SENSITIVITY_ISSUE;
  }
  if (message.includes('You already have a keyword group of the same name')) {
    return ERROR_CODES.SAME_NAME_KW_GROUP;
  }
  if (message.includes('Trailing spaces in the name')) {
    return ERROR_CODES.EXTRA_SPACE_IN_FIELD;
  }
  return 'ERR_UNKNOWN';
};

module.exports = async (req, res) => {
  const logger = req.logger;

  logger.info('Received request to rename keyword group.');
  console.log('Received request to rename keyword group.');
  logger.info(`Request body: ${JSON.stringify(req.body)}`);
  console.log(`Request body: ${JSON.stringify(req.body)}`);
  logger.info(`Uploaded file: ${req.file.originalname}`);
  console.log(`Uploaded file: ${req.file.originalname}`);

  const { username, password, accountID, hierarchy } = req.body;
  const csvFileName = req.file.originalname;
  const csvFilePath = req.file.path;

  // Check if the file is a CSV file
  if (path.extname(csvFileName).toLowerCase() !== '.csv') {
    logger.error('The uploaded file is not a CSV file.');
    console.log('The uploaded file is not a CSV file.');
    return res.status(400).json({ error: 'Unsupported input file', errorCode: ERROR_CODES.UNSUPPORTED_FILE });
  }

  // Detect file encoding
  const originalEncoding = chardet.detectFileSync(csvFilePath);

  // If the file is not UTF-8 encoded, return a 400 response
  if (originalEncoding !== 'UTF-8') {
    logger.error('Uploaded file is not UTF-8 encoded.');
    console.log('Uploaded file is not UTF-8 encoded.');
    return res.status(400).json({ error: 'Non-UTF8 characters included in the file', errorCode: ERROR_CODES.NON_UTF8_FILE });
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
        await page.goto('https://www.brightedge.com/secure/login', { waitUntil: 'networkidle2' });
        await page.type('#UserLogin', username);
        await page.type('#UserPassword', password);

        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2' }),
          page.click('#login_submit')
        ]);

        const baseUrl = page.url().match(/^https:\/\/[^/]+/)[0];
        const failedGroups = []; // Array to track failed keyword groups
        const successfulGroups = []; // Array to track successfully processed keyword groups

        // Process each keyword group sequentially
        for (let i = 0; i < results.length; i++) {
          const row = results[i];
          const kgId = row[Object.keys(row)[0]];
          const newName = row[Object.keys(row)[2]];

          if (newName.trim().length !== newName.length) {
            const message = `Please review this keyword group name and remove any trailing spaces: ${newName} (Keyword Group ID: ${kgId})`;
            logger.warn(message);
            console.log(message);
            failedGroups.push({ kgId, reason: message, errorCode: ERROR_CODES.EXTRA_SPACE_IN_FIELD });
            continue; // Skip to next iteration
          }

          let success = false;
          for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
              if (hierarchy.toUpperCase() === 'F') {
                await page.goto(`${baseUrl}/admin/edit_account_details/${accountID}`, { waitUntil: 'networkidle2' });
                const newUrl = `${baseUrl}/setup/keyword_management_edit_keyword_group/${kgId}`;
                await navigateAndEditRenameKWG(page, newUrl, newName, false, kgId, hierarchy, logger);
              } else {
                await page.goto(`${baseUrl}/admin/edit_account_details/${accountID}`, { waitUntil: 'networkidle2' });
                const newUrl = `${baseUrl}/setup/keyword_groups_new_management/?param={"kg":${kgId}}`;
                await navigateAndEditRenameKWG(page, newUrl, newName, true, kgId, hierarchy, logger);
              }
              success = true;
              break;
            } catch (error) {
              const errorCode =   getErrorCode(error.message);
              logger.error(`Attempt ${attempt + 1} failed for keyword group ID: ${kgId}`, error);
              console.log(`Attempt ${attempt + 1} failed for keyword group ID: ${kgId}`, error);

              // Do not retry if error code is SAME_NAME_KW_GROUP or CASE_SENSITIVITY_ISSUE
              if (errorCode === ERROR_CODES.SAME_NAME_KW_GROUP || 
                errorCode === ERROR_CODES.CASE_SENSITIVITY_ISSUE || 
                errorCode === ERROR_CODES.EXTRA_SPACE_IN_FIELD) {
                logger.error(`Not retrying keyword group ID: ${kgId} due to error code: ${errorCode}`);
                console.log(`Not retrying keyword group ID: ${kgId} due to error code: ${errorCode}`);
                failedGroups.push({ kgId, reason: error.message, errorCode });
                break;
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
            logger.info(`Processed keyword group ID: ${kgId} with new name: ${newName}`);
            console.log(`Processed keyword group ID: ${kgId} with new name: ${newName}`);
            successfulGroups.push({ kgId, newName });
          }
        }

        const responseMessage = {
          message: 'Keyword group rename process completed.',
          failedGroups: failedGroups,
          successfulGroups: successfulGroups
        };

        res.json(responseMessage);
        const completionMessage = 'Keyword group rename process completed.';
        logger.info(completionMessage);
        console.log(completionMessage);

      } catch (error) {
        logger.error('An error occurred:', error);
        console.log('An error occurred:', error);
        res.status(500).json({ error: 'An error occurred while processing the request.', errorCode: getErrorCode(error.message) });
      } finally {
        await browser.close();
      }
    });
};
