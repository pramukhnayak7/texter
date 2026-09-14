document.addEventListener('DOMContentLoaded', () => {
    const openPanelBtn = document.getElementById('openPanelBtn');

    async function openSidebar() {
        if (chrome.sidePanel && chrome.sidePanel.open) {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) {
                await chrome.sidePanel.open({ tabId: tab.id });
                window.close();
            }
        }
    }

    if (openPanelBtn) {
        openPanelBtn.addEventListener('click', openSidebar);
    }

    // Auto-attempt opening sidepanel immediately
    openSidebar();
});
