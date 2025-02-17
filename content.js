let viewThreshold = 1000; // Default value,  updated from storage
let viewMaxThreshold = 0; // Default max threshold, updated from storage - 0 means no max limit
let extensionEnabled = true; // Default to enabled, updated from storage

// Get settings from storage
chrome.storage.sync.get(['viewThreshold', 'viewMaxThreshold', 'extensionEnabled'], function (result) {
    if (result.viewThreshold !== undefined) {
        viewThreshold = result.viewThreshold;
    }
    if (result.viewMaxThreshold !== undefined) { // Load max threshold from storage
        viewMaxThreshold = result.viewMaxThreshold;
    }
    if (result.extensionEnabled !== undefined) {
        extensionEnabled = result.extensionEnabled;
    }
    if (extensionEnabled) {
        initializeExtension();
    }
});

// Listen for storage updates
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
        if (changes.viewThreshold) {
            viewThreshold = changes.viewThreshold.newValue;
        }
        if (changes.viewMaxThreshold) { // Update max threshold from storage
            viewMaxThreshold = changes.viewMaxThreshold.newValue;
        }
        if (changes.extensionEnabled !== undefined) {
            extensionEnabled = changes.extensionEnabled.newValue;
        }

        // Re-run filtering if enabled and threshold or enabled state changed
        if (extensionEnabled && (changes.viewThreshold || changes.viewMaxThreshold || changes.extensionEnabled)) {
            debouncedHideNoViewVideos();
        } else if (!extensionEnabled) {
            // If disabled, remove any applied styles and disconnect observer
            resetVideoStyles();
            if (window.viewFilterObserver) {
                window.viewFilterObserver.disconnect();
            }
        }
    }
});

// Function to reset video styles when extension is disabled
function resetVideoStyles() {
    const videoItems = getAllVideoItems();
    videoItems.forEach(item => {
        item.style.removeProperty('display');
        item.classList.remove('low-views', 'hidden-video');
    });
}

function getViewCountElement(videoItem) {
    // Get the actual video container if we're on a wrapper element
    const actualVideoItem = videoItem.querySelector('ytd-rich-grid-media') || videoItem;

    // Latest YouTube selectors (2024)
    const selectors = [
        // New YouTube format (2024)
        'ytd-video-meta-block .ytd-video-meta-block',
        '#video-title[aria-label]',  // Title with view count in aria-label
        '#metadata-line span.ytd-video-meta-block',
        'span.ytd-video-meta-block[aria-label]',
        // Specific metadata selectors
        '#metadata ytd-badge-supported-renderer span.ytd-video-meta-block',
        'span.inline-metadata-item.style-scope.ytd-video-meta-block',
        // General metadata
        '#metadata-line span',
        '.metadata-stats span'
    ];

    for (const selector of selectors) {
        const elements = actualVideoItem.querySelectorAll(selector);

        for (const element of elements) {
            // Check text content
            const text = element.textContent.trim();
            if (text.toLowerCase().includes('view') && /\d/.test(text)) {
                return element;
            }

            // Check aria-label
            const ariaLabel = element.getAttribute('aria-label');
            if (ariaLabel && ariaLabel.toLowerCase().includes('view') && /\d/.test(ariaLabel)) {
                return element;
            }
        }
    }

    // Try finding in the entire video item as last resort
    const allElements = actualVideoItem.querySelectorAll('*');
    for (const element of allElements) {
        const text = element.textContent.trim();
        const ariaLabel = element.getAttribute('aria-label');

        if ((text && text.toLowerCase().includes('view') && /\d/.test(text)) ||
            (ariaLabel && ariaLabel.toLowerCase().includes('view') && /\d/.test(ariaLabel))) {
            return element;
        }
    }

    return null;
}

function getAllVideoItems() {
    // Get all possible video containers
    const primarySelectors = [
        'ytd-rich-item-renderer:not([is-continuation-item])',  // Main grid items, exclude continuation
        'ytd-rich-grid-media',  // Grid media
        'ytd-video-renderer',   // Search results
        'ytd-compact-video-renderer',  // Sidebar videos
        'ytd-grid-video-renderer'  // Channel videos
    ];

    let items = [];
    for (const selector of primarySelectors) {
        const elements = document.querySelectorAll(selector);
        items.push(...elements);
    }

    // Filter out duplicates and non-video items
    items = [...new Set(items)].filter(item => {
        // Make sure it's a video item
        return item.tagName.toLowerCase().includes('ytd-') &&
            !item.hasAttribute('is-continuation-item') &&
            (item.querySelector('#video-title') || item.querySelector('a[href*="watch"]'));
    });

    console.log('Found video containers:', items.length);
    return items;
}

function parseViewCount(viewText) {
    if (!viewText) return 0;

    // Handle aria-label format
    if (viewText.includes('ago')) {
        const match = viewText.match(/(\d+(?:\.\d+)?)\s*([KMB])\s*views?/i) ||
            viewText.match(/(\d+(?:,\d+)*)\s*views?/i);
        if (!match) return 0;

        let [_, number, suffix] = match;
        number = number.replace(/,/g, '');

        if (suffix) {
            const multipliers = { 'K': 1000, 'M': 1000000, 'B': 1000000000 };
            return parseFloat(number) * multipliers[suffix.toUpperCase()];
        }
        return parseFloat(number);
    }

    // Regular view count format
    viewText = viewText.toLowerCase()
        .replace(/views?/gi, '')
        .replace(/[•|,]/g, '')
        .replace(/\s+/g, '')
        .trim();

    const multipliers = {
        'k': 1000,
        'm': 1000000,
        'b': 1000000000
    };

    const match = viewText.match(/^([\d.]+)([kmb])?$/i);
    if (!match) return 0;

    let [_, number, suffix] = match;
    number = parseFloat(number);

    if (suffix && multipliers[suffix.toLowerCase()]) {
        number *= multipliers[suffix.toLowerCase()];
    }

    return number;
}

async function hideNoViewVideos() {
    if (!extensionEnabled) {
        console.log('YouTube View Filter: Extension is disabled, skipping filtering.');
        return;
    }

    try {
        const videoItems = getAllVideoItems();
        console.log('Processing video items:', videoItems.length);

        let hiddenCount = 0;
        let processedCount = 0;

        for (const item of videoItems) {
            const viewCountElement = getViewCountElement(item);

            if (viewCountElement) {
                const viewText = viewCountElement.textContent.trim();
                const viewCount = parseViewCount(viewText);

                console.log(`Video stats - Text: "${viewText}", Count: ${viewCount}, Min Threshold: ${viewThreshold}, Max Threshold: ${viewMaxThreshold}`);
                processedCount++;

                let shouldHide = false;

                if (viewThreshold > 0 && viewCount < viewThreshold) { // Check minimum threshold
                    shouldHide = true;
                    console.log(`Hiding video - Views: ${viewCount} (below min threshold)`);
                }

                if (viewMaxThreshold > 0 && viewCount > viewMaxThreshold) { // Check maximum threshold
                    shouldHide = true;
                    console.log(`Hiding video - Views: ${viewCount} (above max threshold)`);
                }

                if (shouldHide) {
                    item.classList.add('low-views');

                    // Add hidden-video class after animation completes
                    item.addEventListener('transitionend', () => {
                        item.classList.add('hidden-video');
                        item.style.setProperty('display', 'none', 'important');
                    }, { once: true });

                    hiddenCount++;
                } else {
                    item.style.removeProperty('display');
                    item.classList.remove('low-views', 'hidden-video');
                }
            }
        }

        console.log(`Summary: Processed ${processedCount}/${videoItems.length} videos, Hidden ${hiddenCount} videos`);
    } catch (error) {
        console.error('YouTube View Filter: Error hiding videos:', error);
    }
}


// Debounce function to prevent too frequent updates
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Debounced version of hideNoViewVideos
const debouncedHideNoViewVideos = debounce(hideNoViewVideos, 250);

// Increase initial delay to ensure page is fully loaded
setTimeout(debouncedHideNoViewVideos, 2500);

// Update observer to be more specific about what changes to watch
const observerConfig = {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style'] // Only watch for relevant attribute changes
};

// Disconnect previous observer if it exists
if (window.viewFilterObserver) {
    window.viewFilterObserver.disconnect();
}

// Create and store observer instance
window.viewFilterObserver = new MutationObserver((mutations) => {
    if (!extensionEnabled) return;

    const shouldUpdate = mutations.some(mutation => {
        // Check if the mutation is relevant to video content
        const target = mutation.target;
        return target.tagName && (
            target.tagName.toLowerCase().includes('ytd-') ||
            target.id === 'contents' ||
            target.id === 'content' ||
            target.classList?.contains('ytd-rich-grid-renderer')
        );
    });

    if (shouldUpdate) {
        debouncedHideNoViewVideos();
    }
});

// Start observing with updated configuration
window.viewFilterObserver.observe(document.body, observerConfig);

// Initialize the extension
async function initializeExtension() {
    if (!extensionEnabled) {
        console.log('YouTube View Filter: Extension is disabled, skipping initialization.');
        return;
    }
    try {
        // No need to get viewThreshold again here, it's already loaded in the initial storage get
        // Initial run with a small delay to ensure DOM is ready
        await new Promise(resolve => setTimeout(resolve, 1000));
        await hideNoViewVideos();

        // Set up the observer
        setupObserver();
    } catch (error) {
        console.error('YouTube View Filter: Initialization error:', error);
    }
}

function setupObserver() {
    // Clean up existing observer
    if (window.viewFilterObserver) {
        window.viewFilterObserver.disconnect();
    }

    const observerConfig = {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style']
    };

    window.viewFilterObserver = new MutationObserver((mutations) => {
        if (!extensionEnabled) return; // Check if enabled before processing mutations

        const shouldUpdate = mutations.some(mutation => {
            const target = mutation.target;
            return target.tagName && (
                target.tagName.toLowerCase().includes('ytd-') ||
                target.id === 'contents' ||
                target.id === 'content' ||
                target.classList?.contains('ytd-rich-grid-renderer')
            );
        });

        if (shouldUpdate) {
            debouncedHideNoViewVideos();
        }
    });

    // Start observing
    window.viewFilterObserver.observe(document.body, observerConfig);
}

// Initialize the extension based on document ready and if enabled initially
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Initialization is now handled in the initial storage.get callback based on extensionEnabled
    });
} else {
    // Initialization is now handled in the initial storage.get callback based on extensionEnabled
}

// Handle navigation changes (for YouTube's SPA behavior)
let lastUrl = location.href;
new MutationObserver(() => {
    if (!extensionEnabled) return; // Check if enabled before handling navigation

    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        setTimeout(debouncedHideNoViewVideos, 1000);
    }
}).observe(document, { subtree: true, childList: true });