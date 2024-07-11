const puppeteer = require('puppeteer');

const navigateAndEditRenameKWG = async (page, url, newName, isHierarchyEnabled, kgId, hierarchy, logger) => {
  try {
    logger.info(`Navigating to URL for keyword group ID: ${kgId}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 5000 });
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
  } catch (error) {
    logger.error(`No element found for selector: ${editButtonSelector} for keyword group ID: ${kgId}:`, error);
    throw new Error(`No element found for selector: ${editButtonSelector}`);
  }
  await page.click(editButtonSelector);

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
    await page.waitForNavigation();
  } catch (error) {
    logger.error(`No element found for selector: ${saveButtonSelector} for keyword group ID: ${kgId}:`, error);
    throw new Error(`No element found for selector: ${saveButtonSelector}`);
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

const navigateAndEditRenamePgGrp = async (page, url, newName, PageGrpID, logger) => {
  try {
    logger.info(`Navigating to URL for page group ID: ${PageGrpID}`);
    await page.goto(url, { timeout: 30000 }); // Set a timeout of 30 seconds (adjust as needed)
  } catch (error) {
    logger.error(`Failed to navigate to the correct page for Page group ID: ${PageGrpID}`, error);
    throw new Error(`Failed to navigate to the correct page for Page group ID: ${PageGrpID}`);
  }

  const currentUrl = page.url();
  if (currentUrl !== url) {
    logger.error(`URL mismatch for page group ID: ${PageGrpID}. Expected: ${url}, but got: ${currentUrl}`);
    throw new Error(`Failed to navigate to the correct page for page group ID: ${PageGrpID}`);
  }

  try {
    logger.info(`Entering new name for page group ID: ${PageGrpID}`);
    const nameInput = await page.$('#PageGroupName');
    await nameInput.click({ clickCount: 3 });
    await nameInput.type(newName);

    logger.info(`Saving new name for page group ID: ${PageGrpID}`);
    await page.click('.savePageGroupButton');

    // Verify the name has been updated
    await page.goto(url);
    const updatedName = await page.$eval('#PageGroupName', el => el.value);

    if (updatedName !== newName) {
      logger.error(`Failed to update page group name for ID: ${PageGrpID}. Expected: ${newName}, Found: ${updatedName}`);
      throw new Error(`Failed to update page group name for ID: ${PageGrpID}. Expected: ${newName}, Found: ${updatedName}`);
    }
    logger.info(`Rename Verified for Page Group ID: ${PageGrpID}`);
  } catch (error) {
    logger.error(`An error occurred while renaming page group ID: ${PageGrpID}`, error);
    throw error;
  }
};

module.exports = {
  navigateAndEditRenameKWG, 
  navigateAndEditRenamePgGrp
};
