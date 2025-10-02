function schedule() {
  // Generate random hour between 12-23 (noon to 11pm) in Taipei time
  const randomHour = Math.floor(Math.random() * 12) + 12;
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

  // GitHub repository details
  const owner = "HsiaoSeanHS";
  const repo = "AN-eKphrasIs";
  const workflow_id = "an-ekphrasis.yml";
  const githubToken =
    PropertiesService.getScriptProperties().getProperty("GITHUB_TOKEN");

  // Option 1: Update the workflow file directly with new cron schedule
  updateWorkflowFile(owner, repo, workflow_id, cronExpression, githubToken);

  // Option 2: Trigger repository_dispatch event
  // triggerRepositoryDispatch(owner, repo, githubToken, formattedTime);

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
        formattedTime,
        `UTC: ${utcHour}:${randomMinute.toString().padStart(2, "0")}`,
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

// function triggerRepositoryDispatch(owner, repo, token, scheduledTime) {
//   try {
//     const url = `https://api.github.com/repos/${owner}/${repo}/dispatches`;
//     const options = {
//       method: "post",
//       headers: {
//         Authorization: `token ${token}`,
//         Accept: "application/vnd.github.v3+json",
//       },
//       payload: JSON.stringify({
//         event_type: "schedule_anki_review",
//         client_payload: {
//           scheduled_time: scheduledTime,
//         },
//       }),
//       muteHttpExceptions: true,
//     };

//     const response = UrlFetchApp.fetch(url, options);
//     console.log("Repository dispatch triggered:", response.getResponseCode());
//     return true;
//   } catch (error) {
//     console.error("Error triggering repository dispatch:", error);
//     return false;
//   }
// }
