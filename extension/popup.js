document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('aiModeToggle');
    const statusText = document.getElementById('statusText');

    // Load current state
    chrome.storage.local.get(['aiModeActive'], (result) => {
        toggle.checked = !!result.aiModeActive;
        updateStatus(toggle.checked);
    });

    // Handle toggle
    toggle.addEventListener('change', (e) => {
        const isActive = e.target.checked;
        chrome.storage.local.set({ aiModeActive: isActive });
        updateStatus(isActive);
    });

    function updateStatus(isActive) {
        statusText.textContent = isActive ? 'Active' : 'Off';
        statusText.style.color = isActive ? '#6e8efb' : 'inherit';
    }
});
