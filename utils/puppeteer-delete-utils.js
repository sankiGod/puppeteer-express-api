const navigateAndDeleteKWG = async (page, url, isHierarchyEnabled, kgId, kgName, logger) => {
  try {
    logger.info(`Navigating to URL for keyword group ID: ${kgId}`);
    await page.goto(url, { timeout: 10000 });
    logger.info(`Successfully navigated to URL for keyword group ID: ${kgId}: ${url}`);
  } catch (error) {
    logger.error(`Failed to navigate to the correct page for keyword group ID: ${kgId}`, error);
    throw new Error(`Failed to navigate to the correct page for keyword group ID: ${kgId}`);
  }

  // Delete keyword group
  const deleteButtonSelector = isHierarchyEnabled ? '.kg-delete-button' : '.delete_button';
  const confirmButtonSelector = isHierarchyEnabled ? '#delete_kg_confirm' : '.delete_group_button';
  
  try {
    logger.info(`Waiting for selector: ${deleteButtonSelector}`);
    await page.waitForSelector(deleteButtonSelector, { timeout: 10000 });
    logger.info(`Selector ${deleteButtonSelector} found. Clicking on delete button.`);
    await page.click(deleteButtonSelector);
    await page.waitForNavigation();

    if (isHierarchyEnabled) {
      // Wait for the confirmation dialog
      await page.waitForSelector('#ui-id-4.ui-dialog-title', { timeout: 10000 });

      // Check if the name in the dialog matches kgName
      const dialogTitle = await page.evaluate(() => {
        const element = document.querySelector('#ui-id-4.ui-dialog-title');
        return element ? element.textContent : null;
      });

      const dialogNameMatch = dialogTitle && dialogTitle.includes(`"${kgName}"`);
      if (!dialogNameMatch) {
        logger.error(`Existing name does not match the given name for keyword group ID: ${kgId}`);
        throw new Error(`Existing name does not match the given name for keyword group ID: ${kgId}`);
      }
      logger.info('Confirmation dialog verified.');
    } else {
      // Check if the existing name matches from the file
      logger.info('Verifying existing name matches.');
      let existingName;
      try {
        existingName = await page.evaluate(() => {
          const element = document.getElementById('boxheader_snapshot');
          return element ? element.textContent.trim() : null;
        });

        if (existingName !== kgName) {
          logger.error(`Failed to delete keyword group ID: ${kgId}. Expected existing name: ${kgName}, but found: ${existingName}`);
          throw new Error(`Failed to delete keyword group ID: ${kgId}. Expected existing name: ${kgName}, but found: ${existingName}`);
        }
        logger.info(`Deletion Verified for Keyword Group ID: ${kgId}`);
      } catch (error) {
        logger.error(`Failed to find or match the existing name for keyword group ID: ${kgId}`);
        throw new Error(`Failed to find or match the existing name for keyword group ID: ${kgId}`);
      }
    }

    // Click the 'Yes' button to confirm deletion
    logger.info(`Waiting for selector: ${confirmButtonSelector}`);
    await page.waitForSelector(confirmButtonSelector, { timeout: 10000 });
    logger.info(`Selector ${confirmButtonSelector} found. Clicking on confirm button.`);
    await page.click(confirmButtonSelector);
    logger.info('Clicked on confirm button for deletion.');
  } catch (error) {
    logger.error(`An error occurred while deleting keyword group ID: ${kgId}`, error);
    throw error;
  }

  // Wait for navigation to check if deletion was successful
  try {
    logger.info(`Waiting for navigation after deletion for keyword group ID: ${kgId}`);
    await page.waitForNavigation({ timeout: 10000 });
    const redirectedUrl = page.url();
    if (!redirectedUrl.includes('/ui/platform-r/home/')) {
      logger.error(`Keyword group ID: ${kgId} deletion not successful.`);
      throw new Error(`Keyword group ID: ${kgId} deletion not successful.`);
    }
    logger.info(`Keyword Group with ID: ${kgId} successfully deleted`);
  } catch (error) {
    logger.error(`Failed to confirm deletion for keyword group ID: ${kgId}`);
    throw new Error(`Failed to confirm deletion for keyword group ID: ${kgId}`);
  }
};

module.exports = {
  navigateAndDeleteKWG
};
