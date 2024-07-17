const puppeteer = require('puppeteer');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const navigateAndEditRenameKWG = async (page, url, newName, isHierarchyEnabled, kgId, hierarchy, logger) => {
  let ajaxResponse = null;

  // Intercept and log AJAX responses
  page.on('response', async (response) => {
    const requestUrl = response.url();
    const ajaxUrl = isHierarchyEnabled ? '/setup_table/ajax_edit_keyword_group/' : '/service_ui/setup_ui/ajax_add_keyword_group/';
    if (requestUrl.includes(ajaxUrl) && response.request().method() === 'POST') {
      try {
        const jsonResponse = await response.json();
        ajaxResponse = jsonResponse;
      } catch (err) {
        logger.warn(`Could not load body for this request: ${requestUrl}. This might happen if the request is a preflight request.`);
      }
    }
  });

  try {
    logger.info(`Navigating to URL for keyword group ID: ${kgId}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 }); // Adjusted timeout
  } catch (error) {
    logger.error(`Failed to navigate to the correct page for keyword group ID: ${kgId}:`, error);
    throw new Error(`Failed to navigate to the correct page for keyword group ID: ${kgId}`);
  }

  const currentUrl = decodeURIComponent(page.url());
  if (currentUrl !== url) {
    logger.error(`URL mismatch for keyword group ID: ${kgId}. Expected: ${url}, but got: ${currentUrl}`);
    throw new Error(`Failed to navigate to the correct page for keyword group ID: ${kgId}`);
  }

  const editButtonSelector = isHierarchyEnabled ? '.kg-edit-button' : '.be_button_container .edit_button';
  try {
    logger.info(`Waiting for edit button selector for keyword group ID: ${kgId}`);
    await page.waitForSelector(editButtonSelector, { timeout: 5000 });
    await page.click(editButtonSelector);
  } catch (error) {
    logger.error(`No element found for selector: ${editButtonSelector} for keyword group ID: ${kgId}:`, error);
    throw new Error(`No element found for selector: ${editButtonSelector}`);
  }

  const nameInput = await page.$('#AccountKeywordGroupName');
  if (!nameInput) {
    logger.error(`Failed to find the input element for keyword group ID: ${kgId}`);
    throw new Error(`Failed to find the input element for keyword group ID: ${kgId}`);
  }
  await nameInput.click({ clickCount: 3 });
  await nameInput.type(newName);

  const saveButtonSelector = isHierarchyEnabled ? '#edit_kg_confirm' : '.saveButton.be_button';

  try {
    logger.info(`Waiting for save button selector for keyword group ID: ${kgId}`);
    await page.waitForSelector(saveButtonSelector, { timeout: 5000 });
    await page.click(saveButtonSelector);

    // Wait for the AJAX response to be processed
    await delay(3000);

    // Check the AJAX response
    if (ajaxResponse) {
      if (isHierarchyEnabled) {
        if (ajaxResponse.response === 2) {
          logger.error(`Keyword group ID: ${kgId}: ${ajaxResponse.error_msg}`);
          throw new Error(ajaxResponse.error_msg);
        }
      } else {
        if (ajaxResponse.status === false && ajaxResponse.response === 1) {
          const errorMessageElement = await page.$('#errorMessage');
          if (errorMessageElement) {
            const errorMessage = await page.evaluate(element => element.textContent.trim(), errorMessageElement);
            logger.error(`Keyword group ID: ${kgId}: ${errorMessage}`);
            throw new Error(errorMessage);
          } else {
            logger.error(`Keyword group ID: ${kgId}: AJAX response indicated failure but no error message found.`);
            throw new Error('Failed to create keyword group, but no specific error message was found.');
          }
        }
      }
    }

    const newUrl = decodeURIComponent(page.url());
    if (newUrl.includes('keyword_management_create_keyword_group')) {
      logger.error(`Failed to rename keyword group ID: ${kgId}. URL indicates creation instead of edit: ${newUrl}`);
      throw new Error('Failed to rename keyword group, navigated to creation page instead.');
    }
  } catch (error) {
    logger.error(`Error while saving keyword group ID: ${kgId}:`, error);
    throw new Error(`Error while saving keyword group ID: ${kgId}: ${error.message}`);
  }

  // Check if the new name was successfully saved.
  let boxHeaderValue;
  if (hierarchy.toUpperCase() === 'T') {
    boxHeaderValue = await page.evaluate(() => {
      const element = document.querySelector('.keyword-group-name');
      return element ? element.textContent.trim() : null;
    });
  } else {
    boxHeaderValue = await page.evaluate(() => {
      const element = document.getElementById('boxheader_snapshot');
      return element ? element.textContent.trim() : null;
    });
  }

  if (boxHeaderValue !== newName) {
    logger.error(`Failed to rename keyword group ID: ${kgId}. Expected name: ${newName}, but found: ${boxHeaderValue}`);
    throw new Error(`Failed to rename keyword group ID: ${kgId}. Expected name: ${newName}, but found: ${boxHeaderValue}`);
  }
  logger.info(`Rename Verified for Kwg Group ID: ${kgId}`);
};

const navigateAndEditRenamePgGrp = async (page, url, newName, PageGrpID, logger, getErrorCode) => {
  try {
    logger.info(`Navigating to URL for page group ID: ${PageGrpID}`);
    await page.goto(url, { timeout: 30000 }); // Set a timeout of 30 seconds (adjust as needed)
  } catch (error) {
    const errorMessage = `Failed to navigate to the correct page for Page group ID: ${PageGrpID}`;
    logger.error(errorMessage, error);
    throw new Error(`${errorMessage}: ${getErrorCode(errorMessage)}`);
  }

  const currentUrl = page.url();
  if (currentUrl !== url) {
    const errorMessage = `URL mismatch for page group ID: ${PageGrpID}. Expected: ${url}, but got: ${currentUrl}`;
    logger.error(errorMessage);
    throw new Error(`${errorMessage}: ${getErrorCode(errorMessage)}`);
  }

  try {
    logger.info(`Entering new name for page group ID: ${PageGrpID}`);
    const nameInput = await page.$('#PageGroupName');
    if (!nameInput) {
      const errorMessage = `Failed to find the input element for page group ID: ${PageGrpID}`;
      logger.error(errorMessage);
      throw new Error(`${errorMessage}: ${getErrorCode(errorMessage)}`);
    }
    await nameInput.click({ clickCount: 3 });
    await nameInput.type(newName);

    logger.info(`Saving new name for page group ID: ${PageGrpID}`);
    await page.click('.savePageGroupButton');

    // Verify the name has been updated
    await page.goto(url);
    const updatedName = await page.$eval('#PageGroupName', el => el.value);

    if (updatedName !== newName) {
      const errorMessage = `Failed to update page group name for ID: ${PageGrpID}. Expected: ${newName}, Found: ${updatedName}`;
      logger.error(errorMessage);
      throw new Error(`${errorMessage}: ${getErrorCode(errorMessage)}`);
    }
    logger.info(`Rename Verified for Page Group ID: ${PageGrpID}`);
  } catch (error) {
    const errorMessage = `An error occurred while renaming page group ID: ${PageGrpID}`;
    logger.error(errorMessage, error);
    throw new Error(`${errorMessage}: ${error.message}`);
  }
};

module.exports = {
  navigateAndEditRenameKWG,
  navigateAndEditRenamePgGrp
};
