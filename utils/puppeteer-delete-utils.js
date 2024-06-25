const puppeteer = require('puppeteer');

const navigateAndDeleteKWG = async (page, url, isHierarchyEnabled, kgId, kgName) => {
  try {
    await page.goto(url, { timeout: 10000 });
  } catch (error) {
    throw new Error(`Failed to navigate to the correct page for keyword group ID: ${kgId}`);
  }

  // Delete kwg
  const deleteButtonSelector = isHierarchyEnabled ? '.kg-delete-button' : '.delete_button';
  const confirmButtonSelector = isHierarchyEnabled ? '#delete_kg_confirm' : '.delete_group_button';
  
  try {
    await page.waitForSelector(deleteButtonSelector, { timeout: 10000 });
    await page.click(deleteButtonSelector);

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
        throw new Error(`Existing name does not match the given name for keyword group ID: ${kgId}`);
      }
    } else {
      // Check if the existing name matches from the file
      let existingName;
      try {
        existingName = await page.evaluate(() => {
          const element = document.getElementById('boxheader_snapshot');
          console.log(element);
          return element ? element.textContent.trim() : null;
        });

        if (existingName !== kgName) {
          throw new Error(`Failed to delete keyword group ID: ${kgId}. Expected existing name: ${kgName}, but found: ${existingName}`);
        }
        console.log(`Deletion Verified for Keyword Group ID: ${kgId}`);
      } catch (error) {
        throw new Error(`Failed to find or match the existing name for keyword group ID: ${kgId}`);
      }
    }

    // Click the 'Yes' button to confirm deletion
    await page.waitForSelector(confirmButtonSelector, { timeout: 10000 });
    await page.click(confirmButtonSelector);
  } catch (error) {
    throw new Error(`No element found for selector: ${deleteButtonSelector} or ${confirmButtonSelector}`);
  }

  // Wait for navigation to check if deletion was successful
  try {
    await page.goto(url, { timeout: 10000 });
    const redirectedUrl = page.url();
    if (!redirectedUrl.includes('/ui/platform-r/home/')) {
      throw new Error(`Keyword group ID: ${kgId} deletion not successful.`);
    }
    console.log(`Keyword Group with ID: ${kgId} successfully deleted`);
  } catch (error) {
    throw new Error(`Failed to delete keyword group ID: ${kgId}`);
  }
};

module.exports = {
  navigateAndDeleteKWG
};
