function schedule() {
  // Generate random hour between 12-23 (noon to 22:59) in Taipei time
  const randomHour = Math.floor(Math.random() * 11) + 12;
  const randomMinute = Math.floor(Math.random() * 60);

  // Format times for display and cron syntax
  const formattedTime = `${randomHour}:${randomMinute
    .toString()
    .padStart(2, "0")}`;

  // Convert from Taipei time (UTC+8) to UTC for GitHub Actions
  let utcHour = randomHour - 8;
  if (utcHour < 0) utcHour += 24;

  // Cron syntax for GitHub Actions (minute hour * * *)
  const cronExpression = `${randomMinute} ${utcHour} * * *`;

  console.log(
    `Generated random time: ${formattedTime} Taipei time (${cronExpression} UTC)`
  );

  // Send Telegram notification
  sendTelegramNotification(formattedTime);

  // GitHub repository details
  const owner = "HsiaoSeanHS";
  const repo = "AN-eKphrasIs";
  const workflow_id = "an-ekphrasis.yml";
  const githubToken =
    PropertiesService.getScriptProperties().getProperty("GITHUB_TOKEN");

  updateWorkflowFile(owner, repo, workflow_id, cronExpression, githubToken);

  // Record the scheduled time
  const now = new Date();

  // Open spreadsheet by ID instead of relying on active spreadsheet
  const spreadsheetId =
    PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (spreadsheetId) {
    try {
      const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      const sheet =
        spreadsheet.getSheetByName("Schedule Log") ||
        spreadsheet.getSheets()[0];
      sheet.appendRow([
        now,
        `${utcHour}:${randomMinute.toString().padStart(2, "0")}`,
        formattedTime,
      ]);
    } catch (error) {
      console.error("Error logging to spreadsheet:", error);
    }
  } else {
    console.log("No spreadsheet ID configured. Skipping logging.");
  }
}

function updateWorkflowFile(owner, repo, workflow_id, cronExpression, token) {
  try {
    // First, get the current workflow file
    const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/.github/workflows/${workflow_id}`;
    const getOptions = {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
      muteHttpExceptions: true,
    };

    const getResponse = UrlFetchApp.fetch(getUrl, getOptions);
    const fileData = JSON.parse(getResponse.getContentText());
    const content = Utilities.base64Decode(fileData.content);
    const contentStr = Utilities.newBlob(content).getDataAsString();

    // Debug: Log the original content
    // console.log("Original workflow content:", contentStr);

    // Update the cron expression in the workflow file
    const originalRegex = /cron: '([0-9* ]+)'/;

    // Debug: Check if regex matches anything
    // console.log("Regex test result:", originalRegex.test(contentStr));

    const updatedContent = contentStr.replace(
      originalRegex,
      `cron: '${cronExpression}'`
    );

    // Debug: Check if content was actually modified
    // console.log("Content changed:", contentStr !== updatedContent);

    // If no change was made, try a more flexible regex
    let finalContent = updatedContent;
    if (contentStr === updatedContent) {
      console.log("First regex didn't match, trying alternate patterns...");

      // Try different quote styles and formats
      const alternateRegexes = [
        /cron: "([0-9* ]+)"/, // Double quotes
        /cron:[ \t]*'([0-9* ]+)'/, // With whitespace
        /cron:[ \t]*"([0-9* ]+)"/, // With whitespace and double quotes
        /cron:[ \t]*([0-9* ]+)/, // No quotes
      ];

      for (const regex of alternateRegexes) {
        if (regex.test(contentStr)) {
          console.log("Found matching regex:", regex);

          // Preserve the quote style of the original
          if (regex.toString().includes('"')) {
            // If the matching pattern used double quotes, preserve that in replacement
            finalContent = contentStr.replace(
              regex,
              `cron: "${cronExpression}"`
            );
          } else {
            // Otherwise use single quotes as before
            finalContent = contentStr.replace(
              regex,
              `cron: '${cronExpression}'`
            );
          }
          break;
        }
      }
    }

    // Only proceed if a change was made
    if (contentStr === finalContent) {
      console.log("WARNING: No cron pattern was matched in the workflow file!");
      return false;
    }

    console.log("Final content to upload:", finalContent);

    // Commit the updated file back to GitHub
    const updateUrl = `https://api.github.com/repos/${owner}/${repo}/contents/.github/workflows/${workflow_id}`;
    const updateOptions = {
      method: "put",
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
      payload: JSON.stringify({
        message: `Update scheduled time to ${cronExpression}`,
        content: Utilities.base64Encode(finalContent),
        sha: fileData.sha,
      }),
      muteHttpExceptions: true,
    };

    const updateResponse = UrlFetchApp.fetch(updateUrl, updateOptions);
    console.log("Workflow file updated:", updateResponse.getContentText());
    return true;
  } catch (error) {
    console.error("Error updating workflow file:", error);
    return false;
  }
}

function sendTelegramNotification(taipeiTime) {
  try {
    // Get Telegram bot token and chat ID from script properties
    const botToken =
      PropertiesService.getScriptProperties().getProperty("TELEGRAM_BOT_TOKEN");
    const chatId =
      PropertiesService.getScriptProperties().getProperty("TELEGRAM_CHAT_ID");

    if (!botToken || !chatId) {
      console.log(
        "Telegram bot token or chat ID not configured. Skipping notification."
      );
      return false;
    }

    // Create the message
    // const message = `Today will start at ${taipeiTime}`;
    const message = `${taipeiTime}`;

    // Send the notification
    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const payload = {
      chat_id: chatId,
      text: message,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    };

    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    };

    const response = UrlFetchApp.fetch(telegramUrl, options);
    const responseData = JSON.parse(response.getContentText());

    if (responseData.ok) {
      console.log("Telegram notification sent successfully");
      return true;
    } else {
      console.error("Telegram notification failed:", responseData.description);
      return false;
    }
  } catch (error) {
    console.error("Error sending Telegram notification:", error);
    return false;
  }
}
