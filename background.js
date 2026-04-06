// background.js - MV3 Service Worker

chrome.runtime.onInstalled.addListener(() => {
  console.log('Jira Memory Tracker installed');
});

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_CURRENT_TAB_TICKET') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        console.warn('tabs.query error:', chrome.runtime.lastError.message);
        sendResponse({ ticket: null });
        return;
      }

      const tab = tabs && tabs[0];
      if (!tab || !tab.url) {
        sendResponse({ ticket: null });
        return;
      }

      const urlMatch = tab.url.match(/\/browse\/([A-Z]+-\d+)/i)
                    || tab.url.match(/atlassian\.net.*\/([A-Z]+-\d+)/i);

      if (urlMatch) {
        const ticketId = urlMatch[1].toUpperCase();
        const key = `ticket_${ticketId}`;
        chrome.storage.local.get([key], (result) => {
          if (chrome.runtime.lastError) {
            console.warn('storage.get error:', chrome.runtime.lastError.message);
            sendResponse({ ticket: null });
            return;
          }
          sendResponse({ ticket: result[key] || { ticketId, url: tab.url }, ticketId });
        });
      } else {
        sendResponse({ ticket: null });
      }
    });
    return true; // async response
  }
});
