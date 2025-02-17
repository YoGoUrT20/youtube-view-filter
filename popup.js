function saveOptions() {
    const threshold = document.getElementById('threshold').value;
    const maxThreshold = document.getElementById('maxThreshold').value; // Get max threshold value
    const enableButton = document.getElementById('enableButton');
    const extensionEnabled = !enableButton.classList.contains('disabled');

    chrome.storage.sync.set({
        viewThreshold: parseInt(threshold),
        viewMaxThreshold: parseInt(maxThreshold), // Save max threshold
        extensionEnabled: extensionEnabled
    }, function () {
        const status = document.getElementById('status');
        status.textContent = 'Saved!';
        setTimeout(function () {
            status.textContent = '';
        }, 2000);
    });
}

function restoreOptions() {
    const enableButton = document.getElementById('enableButton');

    chrome.storage.sync.get({
        viewThreshold: 1000, // default value
        viewMaxThreshold: 0, // default max threshold to 0 (no upper bound)
        extensionEnabled: true // default to enabled
    }, function (items) {
        document.getElementById('threshold').value = items.viewThreshold;
        document.getElementById('maxThreshold').value = items.viewMaxThreshold; // Restore max threshold input
        updateEnableButtonState(enableButton, items.extensionEnabled);
    });
}

function updateEnableButtonState(button, isEnabled) {
    if (isEnabled) {
        button.textContent = 'Enabled'; // Changed to 'Enable' for clarity
        button.classList.remove('disabled');
    } else {
        button.textContent = 'Disabled';  // Changed to 'Enable' for clarity
        button.classList.add('disabled');
    }
}


document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);

// Event listener for the enable/disable button
document.getElementById('enableButton').addEventListener('click', function() {
    const button = this;
    const isDisabled = button.classList.contains('disabled');
    const newEnabledState = isDisabled;

    chrome.storage.sync.set({
        extensionEnabled: newEnabledState
    }, function() {
        updateEnableButtonState(button, newEnabledState);
        // No reload needed here either for enable/disable toggle
    });
});