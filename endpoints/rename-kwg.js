const fs = require('fs');
const path = require('path');
const chardet = require('chardet');
const csv = require('csv-parser');
const puppeteer = require('puppeteer');
const { navigateAndEditRenameKWG } = require('../utils/puppeteer-rename-utils');

const MAX_RETRIES = 3;

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

        for (const row of results) {
          const kgId = row[Object.keys(row)[0]];
          const newName = row[Object.keys(row)[2]];

          if (newName.trim().length !== newName.length) {
            logger.warn(`Please review this keyword group name and remove any trailing spaces: ${newName} (Keyword Group ID: ${kgId})`);
            failedGroups.push({ kgId, reason: 'Trailing spaces in the name' });
            continue;
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
              logger.error(`Attempt ${attempt + 1} failed for keyword group ID: ${kgId}`, error);
              console.log(`Attempt ${attempt + 1} failed for keyword group ID: ${kgId}`, error);
              if (attempt === MAX_RETRIES - 1) {
                logger.error(`Failed to process keyword group ID: ${kgId} after ${MAX_RETRIES} attempts. Possible Cause: Wrong Account ID or Incorrect Hierarchy given.`);
                failedGroups.push({ kgId, reason: error.message });
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
        const completionMessage = `Keyword group rename process completed.`;
        logger.info(completionMessage);
        console.log(completionMessage); // Log to console


      } catch (error) {
        logger.error('An error occurred:', error);
        console.log('An error occurred:', error);
        res.status(500).send('An error occurred while processing the request.');
      } finally {
        await browser.close();
      }
    });
};
