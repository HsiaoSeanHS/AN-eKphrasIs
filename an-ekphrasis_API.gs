// 這個函式依然保持每天早上（例如 7:02）固定觸發一次
function schedule() {
  // 1. 產生台北時間的隨機時分 (12:00 ~ 22:59)
  const randomHour = Math.floor(Math.random() * 11) + 12; 
  const randomMinute = Math.floor(Math.random() * 60);

  const formattedTime = `${randomHour}:${randomMinute.toString().padStart(2, "0")}`;
  console.log(`今日預計執行時間 (台北時間): ${formattedTime}`);

  // 2. 發送 Telegram 通知預計時間
  sendTelegramNotification(formattedTime);

  // 3. 紀錄到試算表
  logToSpreadsheet(formattedTime);

  // 4. 【核心修改】設定一個今天該時間點執行的「臨時觸發器」
  const today = new Date();
  const runTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), randomHour, randomMinute, 0);

  // 防呆：確保設定的時間在目前時間之後才建立觸發器
  if (runTime.getTime() > today.getTime()) {
    ScriptApp.newTrigger('triggerGitHubAction')
      .timeBased()
      .at(runTime)
      .create();
    console.log(`已成功建立臨時觸發器，將於 ${runTime} 執行 triggerGitHubAction`);
  } else {
    console.log("警告：隨機時間已過，未建立觸發器。");
  }
}

// 將原本寫入試算表的邏輯獨立出來（讓主程式更乾淨，且不需計算 UTC）
function logToSpreadsheet(formattedTime) {
  const now = new Date();
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!spreadsheetId) return;
  
  try {
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const sheet = spreadsheet.getSheetByName("Schedule Log") || spreadsheet.getSheets()[0];
    // 因為不透過 Cron 執行了，中間欄位填 "-" 即可，直接紀錄當下時間與預計台北時間
    sheet.appendRow([now, "-", formattedTime]); 
  } catch (error) {
    console.error("Error logging to spreadsheet:", error);
  }
}

// 當隨機時間到時，系統會自動呼叫此函式
function triggerGitHubAction() {
  const owner = "HsiaoSeanHS";
  const repo = "AN-eKphrasIs";
  const workflow_id = "an-ekphrasis.yml";
  const githubToken = PropertiesService.getScriptProperties().getProperty("GITHUB_TOKEN");

  // GitHub workflow_dispatch API 端點
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow_id}/dispatches`;
  
  const payload = {
    ref: "main" // 你的預設分支名稱，例如 main 或 master
  };

  const options = {
    method: "POST",
    headers: {
      "Authorization": `token ${githubToken}`,
      "Accept": "application/vnd.github.v3+json",
      "Content-Type": "application/json"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    console.log("GitHub API 回傳狀態:", response.getContentText());
  } catch (error) {
    console.error("呼叫 GitHub API 失敗:", error);
  }

  // 【重要】執行完畢後，把這個用完即丟的臨時 Trigger 刪除，避免累積成垃圾
  cleanUpTrigger();
}

// 刪除臨時觸發器的輔助函式
function cleanUpTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'triggerGitHubAction') {
      ScriptApp.deleteTrigger(triggers[i]);
      console.log("已成功清理臨時觸發器");
    }
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
