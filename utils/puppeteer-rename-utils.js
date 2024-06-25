const puppeteer = require('puppeteer');

const navigateAndEditRenameKWG = async (page, url, newName, isHierarchyEnabled, kgId, hierarchy) => {
  try {
    console.log(`Navigating to URL for keyword group ID: ${kgId}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 5000 });
  } catch (error) {
    console.error(`Failed to navigate to the correct page for keyword group ID: ${kgId}:`, error);
    throw new Error(`Failed to navigate to the correct page for keyword group ID: ${kgId}`);
  }

  const currentUrl = decodeURIComponent(page.url());
  if (currentUrl !== url) {
    console.error(`URL mismatch for keyword group ID: ${kgId}. Expected: ${url}, but got: ${currentUrl}`);
    throw new Error(`Failed to navigate to the correct page for keyword group ID: ${kgId}`);
  }

  const editButtonSelector = isHierarchyEnabled ? '.kg-edit-button' : '.be_button_container .edit_button';
  try {
    console.log(`Waiting for edit button selector for keyword group ID: ${kgId}`);
    await page.waitForSelector(editButtonSelector, { timeout: 5000 });
  } catch (error) {
    console.error(`No element found for selector: ${editButtonSelector} for keyword group ID: ${kgId}:`, error);
    throw new Error(`No element found for selector: ${editButtonSelector}`);
  }
  await page.click(editButtonSelector);

  const nameInput = await page.$('#AccountKeywordGroupName');
  if (!nameInput) {
    console.error(`Failed to find the input element for keyword group ID: ${kgId}`);
    throw new Error(`Failed to find the input element for keyword group ID: ${kgId}`);
  }
  await nameInput.click({ clickCount: 3 });
  await nameInput.type(newName);

  const saveButtonSelector = isHierarchyEnabled ? '#edit_kg_confirm' : '.saveButton.be_button';
  try {
    console.log(`Waiting for save button selector for keyword group ID: ${kgId}`);
    await page.waitForSelector(saveButtonSelector, { timeout: 5000 });
    await page.click(saveButtonSelector);
  } catch (error) {
    console.error(`No element found for selector: ${saveButtonSelector} for keyword group ID: ${kgId}:`, error);
    throw new Error(`No element found for selector: ${saveButtonSelector}`);
  }

  // Wait for a while to let the page update after saving
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Check if the new name was successfully saved
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
    console.error(`Failed to rename keyword group ID: ${kgId}. Expected name: ${newName}, but found: ${boxHeaderValue}`);
    throw new Error(`Failed to rename keyword group ID: ${kgId}. Expected name: ${newName}, but found: ${boxHeaderValue}`);
  }
  console.log(`Rename Verified for Kwg Group ID: ${kgId}`);
};

async function navigateAndEditRenamePgGrp(page, url, newName, PageGrpID) {
  try {
    await page.goto(url, { timeout: 30000 }); // Set a timeout of 30 seconds (adjust as needed)
  } catch (error) {
    throw new Error(`Failed to navigate to the correct page for Page group ID: ${PageGrpID}`);
  }

  const currentUrl = page.url();
  if (currentUrl !== url) {
    throw new Error(`Failed to navigate to the correct page for page group ID: ${PageGrpID}`);
  }

  const nameInput = await page.$('#PageGroupName');
  await nameInput.click({ clickCount: 3 });
  await nameInput.type(newName);
  
  await page.click('.savePageGroupButton');

  // Verify the name has been updated
  await page.goto(url);
  const updatedName = await page.$eval('#PageGroupName', el => el.value);

  if (updatedName !== newName) {
    throw new Error(`Failed to update page group name for ID: ${PageGrpID}. Expected: ${newName}, Found: ${updatedName}`);
  }
  console.log(`Rename Verified for Page Group ID: ${PageGrpID})`);
}

module.exports = {
  navigateAndEditRenameKWG, 
  navigateAndEditRenamePgGrp
};