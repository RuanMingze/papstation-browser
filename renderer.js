/**
 * Flowmora Browser - Renderer Script
 * Full-featured browser engine with tabbed browsing,
 * webview management, and persistent sessions.
 */

// ============================================
// Incognito Detection
// ============================================
const urlParams = new URLSearchParams(window.location.search);
const IS_INCOGNITO = urlParams.get('incognito') === 'true';

// ============================================
// Configuration - Loads from saved settings
// ============================================
function loadSavedSettings() {
    try {
        const saved = localStorage.getItem('focusflow-settings');
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (e) {
    }
    return null;
}

const savedSettings = loadSavedSettings();

const CONFIG = {
    get homePage() {
        const settings = loadSavedSettings();
        if (settings && settings.usePresetHomePage) {
            const searchEngine = settings.searchEngine || 'bing';
            return `./preset-home.html?searchEngine=${encodeURIComponent(searchEngine)}`;
        }
        if (settings && settings.homePage) {
            return settings.homePage;
        }
        if (settings && settings.searchEngine) {
            const engines = {
                google: 'https://www.google.com',
                bing: 'https://www.bing.com',
                duckduckgo: 'https://duckduckgo.com',
                yahoo: 'https://www.yahoo.com',
                ecosia: 'https://www.ecosia.org'
            };
            return engines[settings.searchEngine] || 'https://ruanmingze.github.io/ChickRubGo/';
        }
        return 'https://ruanmingze.github.io/ChickRubGo/';
    },
    get searchEngine() {
        const settings = loadSavedSettings();
        if (settings && settings.searchEngine) {
            const engines = {
                google: 'https://www.google.com/search?q=',
                bing: 'https://cn.bing.com/search?q=',
                duckduckgo: 'https://duckduckgo.com/?q=',
                yahoo: 'https://search.yahoo.com/search?p=',
                ecosia: 'https://www.ecosia.org/search?q=',
                chickrubgo: 'https://ruanmingze.github.io/ChickRubGo/search?q='
            };
            return engines[settings.searchEngine] || 'https://ruanmingze.github.io/ChickRubGo/search?q=';
        }
        return 'https://ruanmingze.github.io/ChickRubGo/search?q=';
    },
    defaultTitle: IS_INCOGNITO ? '隐私标签页' : '新标签页',
    // Incognito uses ephemeral partition (no persist: prefix = no storage)
    partition: IS_INCOGNITO ? `incognito-${Date.now()}` : 'persist:focusflow',
    newTabPage: 'about:blank',
    isIncognito: IS_INCOGNITO
};


// ============================================
// Tab Manager Class
// ============================================
class TabManager {
    constructor() {
        this.tabs = new Map(); // tabId -> { webview, title, favicon, url }
        this.activeTabId = null;
        this.tabCounter = 0;
        this.currentContextMenu = null;

        // DOM Elements
        this.tabsContainer = document.getElementById('tabsContainer');
        this.webviewContainer = document.getElementById('webviewContainer');
        this.urlInput = document.getElementById('urlInput');
        this.securityIndicator = document.getElementById('securityIndicator');
        this.statusText = document.getElementById('statusText');

        // Navigation buttons
        this.backBtn = document.getElementById('backBtn');
        this.forwardBtn = document.getElementById('forwardBtn');
        this.reloadBtn = document.getElementById('reloadBtn');
        this.homeBtn = document.getElementById('homeBtn');
        this.newTabBtn = document.getElementById('newTabBtn');
        this.bookmarkBtn = document.getElementById('bookmarkBtn');
        this.pwaInstallBtn = document.getElementById('pwaInstallBtn');

        this.init();
    }

    init() {
        // Set up event listeners
        this.setupNavigationListeners();
        this.setupUrlInputListeners();
        this.setupNewTabListener();
        this.setupSearchInputListener();

        // Create initial tab
        this.createTab(CONFIG.homePage);
    }

    // ============================================
    // Tab Creation & Management
    // ============================================

    createTab(url = CONFIG.homePage) {
        const tabId = ++this.tabCounter;

        // Create tab element
        const tabElement = this.createTabElement(tabId);
        this.tabsContainer.appendChild(tabElement);

        // Create webview and overlay
        const { webview, overlay } = this.createWebview(tabId, url);
        this.webviewContainer.appendChild(webview);
        // Only add overlay if it's not null
        if (overlay) {
            this.webviewContainer.appendChild(overlay);
        }

        // Store tab data
        this.tabs.set(tabId, {
            element: tabElement,
            webview: webview,
            overlay: overlay,
            title: CONFIG.defaultTitle,
            favicon: null,
            url: url,
        });

        // Set up webview event listeners
        this.setupWebviewListeners(tabId, webview);

        // Activate this tab
        this.activateTab(tabId);

        // Focus URL input for new tab
        if (url === CONFIG.newTabPage || url === 'about:blank') {
            setTimeout(() => this.urlInput.focus(), 100);
        }

        return tabId;
    }

    createTabElement(tabId) {
        const tab = document.createElement('div');
        tab.className = 'tab';
        tab.dataset.tabId = tabId;

        tab.innerHTML = `
      <div class="tab-favicon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
      </div>
      <span class="tab-title">${CONFIG.defaultTitle}</span>
      <button class="tab-close" title="Close Tab">
        <svg viewBox="0 0 12 12"><path d="M2 2l8 8M10 2L2 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
      <div class="tab-active-indicator"></div>
    `;

        // Click to activate tab
        tab.addEventListener('click', (e) => {
            if (!e.target.closest('.tab-close')) {
                this.activateTab(tabId);
            }
        });

        // Right-click to close
        tab.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.closeTab(tabId);
        });

        // Close button click
        tab.querySelector('.tab-close').addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeTab(tabId);
        });

        return tab;
    }

    createWebview(tabId, url) {
        const webview = document.createElement('webview');
        webview.id = `webview-${tabId}`;
        webview.className = 'browser-webview';
        webview.setAttribute('partition', CONFIG.partition);
        webview.setAttribute('allowpopups', 'true');
        webview.setAttribute('webpreferences', 'contextIsolation=yes,nodeIntegration=no');
        webview.setAttribute('plugins', 'false');

        // Set initial URL
        if (url && url !== 'about:blank') {
            webview.src = this.normalizeUrl(url);
        }

        // Hide by default
        webview.style.display = 'none';

        // Create transparent overlay for right-click handling
        const overlay = document.createElement('div');
        overlay.id = `overlay-${tabId}`;
        overlay.className = 'webview-overlay';
        overlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 100;
        `;

        // Add right-click event listener to overlay
        overlay.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            console.log('Overlay context menu event triggered', e);
            this.showWebviewContextMenu(e, tabId, webview);
        });

        // Make overlay capture right-clicks but pass through other events
        overlay.style.pointerEvents = 'none';
        
        // Add a child element that captures only right-clicks
        const rightClickCapture = document.createElement('div');
        rightClickCapture.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: auto;
        `;
        
        // Only handle right-click events, let all other events pass through
        rightClickCapture.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Right-click capture event triggered', e);
            this.showWebviewContextMenu(e, tabId, webview);
        });
        
        // Let all other mouse events pass through
        rightClickCapture.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        rightClickCapture.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });
        
        rightClickCapture.addEventListener('mouseup', (e) => {
            e.stopPropagation();
        });
        
        rightClickCapture.addEventListener('mousemove', (e) => {
            e.stopPropagation();
        });
        
        // Remove the overlay entirely
        // We'll handle right-click events directly through the webview's contextmenu event
        return { webview, overlay: null };
    }

    setupWebviewListeners(tabId, webview) {
        // Context menu - disabled
        // webview.addEventListener('contextmenu', (e) => {
        //     // Log all relevant event properties
        //     console.log('Context menu event details:', {
        //         shiftKey: e.shiftKey,
        //         button: e.button,
        //         buttons: e.buttons,
        //         ctrlKey: e.ctrlKey,
        //         altKey: e.altKey,
        //         metaKey: e.metaKey,
        //         type: e.type,
        //         target: e.target ? e.target.tagName : null
        //     });
        //     
        //     // Check if Shift key is pressed
        //     if (e.shiftKey) {
        //         console.log('Shift key is pressed!');
        //         e.preventDefault();
        //         this.showWebviewContextMenu(e, tabId, webview);
        //     } else {
        //         console.log('Shift key is NOT pressed, allowing default context menu');
        //     }
        // });

        // Page title updated
        webview.addEventListener('page-title-updated', (e) => {
            this.updateTabTitle(tabId, e.title);
        });

        // Favicon updated
        webview.addEventListener('page-favicon-updated', (e) => {
            if (e.favicons && e.favicons.length > 0) {
                this.updateTabFavicon(tabId, e.favicons[0]);
            }
        });

        // URL changed (navigation)
        webview.addEventListener('did-navigate', (e) => {
            this.handleNavigation(tabId, e.url);
        });

        webview.addEventListener('did-navigate-in-page', (e) => {
            if (e.isMainFrame) {
                this.handleNavigation(tabId, e.url);
            }
        });

        // HTTP response details (handle status codes)
        webview.addEventListener('did-get-response-details', (e) => {
            if (e.statusCode >= 300 && e.statusCode < 600) {
                // Handle error status codes
                const errorPagePath = `errors/${e.statusCode}.html`;
                // Check if error page exists
                fetch(errorPagePath)
                    .then(response => {
                        if (response.ok) {
                            // Show error page in iframe
                            this.showErrorInIframe(tabId, errorPagePath);
                        } else {
                            // If no specific error page, show generic error
                        }
                    })
                    .catch(err => {
                    });
            }
        });

        // Loading started
        webview.addEventListener('did-start-loading', () => {
            if (this.activeTabId === tabId) {
                this.setStatus('加载中...');
                this.reloadBtn.classList.add('reloading');
            }
        });

        // Loading finished
        webview.addEventListener('did-stop-loading', () => {
            if (this.activeTabId === tabId) {
                this.setStatus('就绪');
                this.reloadBtn.classList.remove('reloading');
                this.updateNavigationState();
            }

            // Knowledge Mode content extraction
            this.extractPageContent(tabId, webview);
        });

        // Loading failed
        webview.addEventListener('did-fail-load', (e) => {
            if (e.errorCode !== -3) { // -3 is aborted
                if (this.activeTabId === tabId) {
                    this.setStatus(`错误：${e.errorDescription}`);
                }
                
                // Map error descriptions to HTTP status codes
                const errorStatusMap = {
                    'ERR_NAME_NOT_RESOLVED': 404,      // DNS 解析失败
                    'ERR_CONNECTION_REFUSED': 502,     // 连接被拒绝
                    'ERR_CONNECTION_TIMED_OUT': 504,   // 连接超时
                    'ERR_INTERNET_DISCONNECTED': 503,  // 网络断开
                    'ERR_HTTP_RESPONSE_CODE_FAILURE': e.statusCode || 500, // 使用实际状态码
                    'ERR_CONNECTION_RESET': 502,       // 连接重置
                    'ERR_NETWORK_ACCESS_DENIED': 403,   // 网络访问被拒绝
                    'ERR_SSL_PROTOCOL_ERROR': 403,      // SSL 协议错误
                    'ERR_CERT_AUTHORITY_INVALID': 403,  // 证书无效
                    'ERR_CERT_COMMON_NAME_INVALID': 403, // 证书名称无效
                    'ERR_CERT_DATE_INVALID': 403        // 证书日期无效
                };
                
                // Get status code from map or default to 500
                const statusCode = errorStatusMap[e.errorDescription] || 500;
                
                // Show error page in iframe
                const errorPagePath = `errors/${statusCode}.html`;
                fetch(errorPagePath)
                    .then(response => {
                        if (response.ok) {
                            this.showErrorInIframe(tabId, errorPagePath);
                        }
                    })
                    .catch(err => {
                    });
            }
        });

        // New window requested (open in new tab)
        webview.addEventListener('new-window', (e) => {
            e.preventDefault();
            const url = e.url;
            // Handle relative paths
            if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://') && !url.startsWith('about:')) {
                // Get current tab's URL to resolve relative path
                const currentTab = this.tabs.get(tabId);
                if (currentTab && currentTab.url) {
                    try {
                        const resolvedUrl = new URL(url, currentTab.url).href;
                        this.createTab(resolvedUrl);
                    } catch (err) {
                        this.createTab(url);
                    }
                } else {
                    this.createTab(url);
                }
            } else {
                this.createTab(url);
            }
        });

        // DOM ready - get initial title if not set
        webview.addEventListener('dom-ready', () => {
            const tab = this.tabs.get(tabId);
            if (tab && tab.title === CONFIG.defaultTitle) {
                webview.executeJavaScript('document.title')
                    .then(title => {
                        if (title) this.updateTabTitle(tabId, title);
                    })
                    .catch(() => { });
            }
            
            // Check for service worker and PWA capabilities
            this.checkPwaCapabilities(tabId, webview);
            
            // Capture beforeinstallprompt event for PWA installation
            webview.executeJavaScript(`
                // Capture beforeinstallprompt event
                window.addEventListener('beforeinstallprompt', (e) => {
                    // Prevent Chrome 67 and earlier from automatically showing the prompt
                    e.preventDefault();
                    // Stash the event so it can be triggered later
                    window.deferredPrompt = e;
                });
            `).catch(err => {
            });
            
            // Handle target="_blank" links to open in new tabs
            webview.executeJavaScript(`
                // Override window.open to handle target="_blank"
                const originalOpen = window.open;
                window.open = function(url, target, features) {
                    if (target === '_blank' || !target) {
                        // Open in new tab
                        console.log('OPEN_IN_NEW_TAB:' + url);
                        return {
                            focus: function() {},
                            close: function() {}
                        };
                    }
                    return originalOpen.apply(this, arguments);
                };
                
                // Add click listener to all links with target="_blank"
                document.addEventListener('click', (e) => {
                    const link = e.target.closest('a');
                    if (link && (link.target === '_blank' || link.getAttribute('rel') === 'noopener noreferrer') && link.href) {
                        e.preventDefault();
                        // Send message to open in new tab
                        console.log('OPEN_IN_NEW_TAB:' + link.href);
                    }
                });
                
                // Also handle links added dynamically
                const observer = new MutationObserver((mutations) => {
                    mutations.forEach((mutation) => {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                if (node.tagName === 'A' && (node.target === '_blank' || node.getAttribute('rel') === 'noopener noreferrer') && node.href) {
                                    node.addEventListener('click', (e) => {
                                        e.preventDefault();
                                        console.log('OPEN_IN_NEW_TAB:' + node.href);
                                    });
                                }
                                // Check child nodes
                                node.querySelectorAll('a[target="_blank"], a[rel*="noopener"]').forEach((link) => {
                                    link.addEventListener('click', (e) => {
                                        e.preventDefault();
                                        console.log('OPEN_IN_NEW_TAB:' + link.href);
                                    });
                                });
                            }
                        });
                    });
                });
                
                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });
            `).catch(err => {
            });
        });

        // Listen for messages from webview (for opening new tabs)
        webview.addEventListener('console-message', (e) => {
            if (e.message && e.message.startsWith('OPEN_IN_NEW_TAB:')) {
                const url = e.message.replace('OPEN_IN_NEW_TAB:', '').trim();
                if (url) {
                    // Handle relative paths
                    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://') && !url.startsWith('about:')) {
                        // Get current tab's URL to resolve relative path
                        const currentTab = this.tabs.get(tabId);
                        if (currentTab && currentTab.url) {
                            try {
                                const resolvedUrl = new URL(url, currentTab.url).href;
                                this.createTab(resolvedUrl);
                            } catch (err) {
                                this.createTab(url);
                            }
                        } else {
                            this.createTab(url);
                        }
                    } else {
                        this.createTab(url);
                    }
                }
            }
        });
    }

    activateTab(tabId) {
        const tab = this.tabs.get(tabId);
        if (!tab) return;

        // Deactivate current tab
        if (this.activeTabId !== null) {
            const currentTab = this.tabs.get(this.activeTabId);
            if (currentTab) {
                currentTab.element.classList.remove('active');
                currentTab.webview.style.display = 'none';
                if (currentTab.overlay) {
                    currentTab.overlay.style.display = 'none';
                }
                if (currentTab.errorIframe) {
                    currentTab.errorIframe.style.display = 'none';
                }
            }
        }

        // Activate new tab
        this.activeTabId = tabId;
        tab.element.classList.add('active');
        if (tab.errorIframe) {
            tab.errorIframe.style.display = 'block';
            tab.webview.style.display = 'none';
        } else {
            tab.webview.style.display = 'flex';
        }
        if (tab.overlay) {
            tab.overlay.style.display = 'block';
        }

        // Update URL bar
        this.updateUrlBar(tab.url);
        this.updateSecurityIndicator(tab.url);
        this.updateNavigationState();

        // Hide new tab page if showing webview
        this.toggleNewTabPage(tab.url === 'about:blank' || !tab.url);
        
        // Check PWA capabilities for the new active tab (safely)
        try {
            this.checkPwaCapabilities(tabId, tab.webview);
        } catch (err) {
        }
    }

    closeTab(tabId) {
        const tab = this.tabs.get(tabId);
        if (!tab) return;

        // Don't close if it's the only tab
        if (this.tabs.size === 1) {
            // Navigate to home instead
            this.navigate(CONFIG.homePage);
            return;
        }

        // Find next tab to activate
        const tabIds = Array.from(this.tabs.keys());
        const currentIndex = tabIds.indexOf(tabId);
        const nextTabId = tabIds[currentIndex === 0 ? 1 : currentIndex - 1];

        // Remove tab
        tab.element.remove();
        tab.webview.remove();
        if (tab.overlay) {
            tab.overlay.remove();
        }
        if (tab.errorIframe) {
            tab.errorIframe.remove();
        }
        this.tabs.delete(tabId);

        // Activate next tab if this was active
        if (this.activeTabId === tabId) {
            this.activateTab(nextTabId);
        }
    }

    showErrorInIframe(tabId, errorPagePath) {
        const tab = this.tabs.get(tabId);
        if (!tab) return;

        // Remove any existing error iframe
        if (tab.errorIframe) {
            tab.errorIframe.remove();
        }

        // Create error iframe
        const iframe = document.createElement('iframe');
        iframe.id = `error-iframe-${tabId}`;
        iframe.className = 'error-iframe';
        iframe.src = errorPagePath;
        iframe.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            border: none;
            z-index: 1000;
        `;

        // Add iframe to webview container
        this.webviewContainer.appendChild(iframe);

        // Store reference to iframe in tab data
        tab.errorIframe = iframe;

        // Hide webview
        tab.webview.style.display = 'none';

        // Show iframe
        iframe.style.display = 'block';
    }

    hideErrorIframe(tabId) {
        const tab = this.tabs.get(tabId);
        if (!tab || !tab.errorIframe) return;

        // Remove error iframe
        tab.errorIframe.remove();
        tab.errorIframe = null;

        // Show webview again
        tab.webview.style.display = 'flex';
    }

    updateTabTitle(tabId, title) {
        const tab = this.tabs.get(tabId);
        if (!tab) return;

        tab.title = title || CONFIG.defaultTitle;
        const titleEl = tab.element.querySelector('.tab-title');
        if (titleEl) {
            titleEl.textContent = tab.title;
            titleEl.title = tab.title; // Tooltip for long titles
        }
    }

    updateTabFavicon(tabId, faviconUrl) {
        const tab = this.tabs.get(tabId);
        if (!tab) return;

        tab.favicon = faviconUrl;
        const faviconEl = tab.element.querySelector('.tab-favicon');
        if (faviconEl) {
            faviconEl.innerHTML = `<img src="${faviconUrl}" alt="" onerror="this.style.display='none'"/>`;
        }
    }

    // ============================================
    // Navigation
    // ============================================

    navigate(input) {
        let url = input.trim();
        
        // Use normalizeUrl directly to handle all cases correctly
        url = this.normalizeUrl(input);
        
        const tab = this.tabs.get(this.activeTabId);

        if (tab && tab.webview) {
            // Hide any existing error iframe
            this.hideErrorIframe(this.activeTabId);
            
            tab.webview.src = url;
            tab.url = url;
            this.toggleNewTabPage(false);
        }
    }

    normalizeUrl(input) {
        if (!input || input === 'about:blank') return input;

        input = input.trim();

        // Check if it's already a valid URL
        if (/^https?:\/\//i.test(input)) {
            return input;
        }

        // Check if it's a local file path
        if (input.startsWith('./') || input.startsWith('../') || input.includes('.html') || input.includes('.htm')) {
            // Return as is for local files
            return input;
        }

        // Check if it looks like a domain
        if (/^[\w-]+(\.[\w-]+)+/.test(input) && !input.includes(' ')) {
            return 'https://' + input;
        }

        // Otherwise, treat as search query
        return CONFIG.searchEngine + encodeURIComponent(input);
    }

    handleNavigation(tabId, url) {
        const tab = this.tabs.get(tabId);
        if (!tab) return;

        tab.url = url;

        if (this.activeTabId === tabId) {
            this.updateUrlBar(url);
            this.updateSecurityIndicator(url);
            this.updateNavigationState();
        }
    }

    goBack() {
        const tab = this.tabs.get(this.activeTabId);
        if (tab && tab.webview && tab.webview.canGoBack()) {
            tab.webview.goBack();
        }
    }

    goForward() {
        const tab = this.tabs.get(this.activeTabId);
        if (tab && tab.webview && tab.webview.canGoForward()) {
            tab.webview.goForward();
        }
    }

    reload() {
        const tab = this.tabs.get(this.activeTabId);
        if (tab && tab.webview) {
            tab.webview.reload();
        }
    }

    openDevTools() {
        const tab = this.tabs.get(this.activeTabId);
        if (tab && tab.webview) {
            tab.webview.openDevTools();
        }
    }

    checkPwaCapabilities(tabId, webview) {
        if (!webview) return;

        try {
            // Check if page has service worker and is installable
            webview.executeJavaScript(`
            (async function() {
                // Check if service worker is registered
                const registrations = await navigator.serviceWorker.getRegistrations();
                const hasServiceWorker = registrations.length > 0;
                
                // Check if PWA is installable
                let isInstallable = false;
                try {
                    // Check for manifest
                    const manifestLink = document.querySelector('link[rel="manifest"]');
                    if (manifestLink) {
                        isInstallable = true;
                    }
                } catch (e) {
                }
                
                return { hasServiceWorker, isInstallable };
            })();
        `).then(result => {
            if (result && result.hasServiceWorker && result.isInstallable) {
                // Show PWA install button if this is the active tab
                if (tabId === this.activeTabId && this.pwaInstallBtn) {
                    this.pwaInstallBtn.style.display = 'flex';
                    
                    // Add click event listener for PWA install
                    this.pwaInstallBtn.onclick = () => {
                        this.installPWA(tabId, webview);
                    };
                }
            } else {
                // Hide PWA install button
                if (this.pwaInstallBtn) {
                    this.pwaInstallBtn.style.display = 'none';
                }
            }
        }).catch(err => {
            // Hide button on error
            if (this.pwaInstallBtn) {
                this.pwaInstallBtn.style.display = 'none';
            }
        });
    } catch (err) {
        // Hide button on error
        if (this.pwaInstallBtn) {
            this.pwaInstallBtn.style.display = 'none';
        }
    }
    }

    installPWA(tabId, webview) {
        if (!webview) return;

        // Trigger PWA installation
        webview.executeJavaScript(`
            (async function() {
                // Check if beforeinstallprompt event is available
                if (window.deferredPrompt) {
                    // Show installation prompt
                    window.deferredPrompt.prompt();
                    
                    // Wait for user to respond
                    const choiceResult = await window.deferredPrompt.userChoice;
                    // Clear the deferred prompt
                    window.deferredPrompt = null;
                    return choiceResult.outcome === 'accepted';
                } else {
                    return false;
                }
            })();
        `).then(installed => {
            if (installed) {
                this.setStatus('PWA 安装成功！');
            } else {
                this.setStatus('PWA 安装已取消');
            }
        }).catch(err => {
            this.setStatus('PWA 安装失败');
        });
    }

    showWebviewContextMenu(e, tabId, webview) {
        console.log('showWebviewContextMenu called', { tabId, webviewId: webview.id });
        const tab = this.tabs.get(tabId);
        if (!tab) {
            console.log('Tab not found for tabId:', tabId);
            return;
        }
        console.log('Tab found:', tab);
        
        // Close any existing context menu
        if (this.currentContextMenu) {
            try {
                if (this.currentContextMenu.parentNode) {
                    document.body.removeChild(this.currentContextMenu);
                    console.log('Closed existing context menu');
                }
            } catch (error) {
                console.error('Error closing existing context menu:', error);
            }
            this.currentContextMenu = null;
        }

        // Get mouse position - handle different event structures
        const x = e.x || e.clientX || e.pageX || 0;
        const y = e.y || e.clientY || e.pageY || 0;

        const canGoBack = webview.canGoBack();
        const canGoForward = webview.canGoForward();

        const menu = document.createElement('div');
        menu.className = 'webview-context-menu';
        menu.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            background: #1a1a2e;
            border: 1px solid #333;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            padding: 4px 0;
            min-width: 180px;
            z-index: 10000;
        `;

        const items = [
            {
                label: '返回',
                enabled: canGoBack,
                action: () => {
                    window.focusFlowAPI.webview.goBack(webview.id);
                }
            },
            {
                label: '前进',
                enabled: canGoForward,
                action: () => {
                    window.focusFlowAPI.webview.goForward(webview.id);
                }
            },
            { divider: true },
            {
                label: '另存为...',
                enabled: true,
                action: () => {
                    window.focusFlowAPI.webview.savePage(webview.id);
                }
            },
            { divider: true },
            {
                label: '检查',
                enabled: true,
                action: () => {
                    webview.openDevTools();
                }
            }
        ];

        items.forEach(item => {
            if (item.divider) {
                const divider = document.createElement('div');
                divider.style.cssText = `
                    height: 1px;
                    background: #333;
                    margin: 4px 0;
                `;
                menu.appendChild(divider);
            } else {
                const menuItem = document.createElement('div');
                menuItem.className = 'context-menu-item';
                menuItem.textContent = item.label;
                menuItem.style.cssText = `
                    padding: 8px 16px;
                    cursor: ${item.enabled ? 'pointer' : 'not-allowed'};
                    color: ${item.enabled ? '#fff' : '#666'};
                    font-size: 13px;
                    transition: background 0.15s;
                `;

                if (item.enabled) {
                    menuItem.addEventListener('mouseenter', () => {
                        menuItem.style.background = '#2a2a4e';
                    });
                    menuItem.addEventListener('mouseleave', () => {
                        menuItem.style.background = 'transparent';
                    });
                    menuItem.addEventListener('click', () => {
                        item.action();
                        document.body.removeChild(menu);
                    });
                }

                menu.appendChild(menuItem);
            }
        });

        console.log('Creating context menu at position:', { x, y });
        console.log('Menu created:', menu);
        
        document.body.appendChild(menu);
        this.currentContextMenu = menu;
        console.log('Menu added to document');
        console.log('Current context menu set:', this.currentContextMenu);

        const closeMenu = () => {
            try {
                if (menu.parentNode) {
                    document.body.removeChild(menu);
                    console.log('Menu removed from document');
                }
                // Clear the current context menu reference
                if (this.currentContextMenu === menu) {
                    this.currentContextMenu = null;
                    console.log('Current context menu cleared');
                }
            } catch (error) {
                console.error('Error closing context menu:', error);
            }
        };

        setTimeout(() => {
            document.addEventListener('click', closeMenu, { once: true });
            console.log('Click listener added to close menu');
        }, 0);
    }

    goHome() {
        this.navigate(CONFIG.homePage);
    }

    updateNavigationState() {
        const tab = this.tabs.get(this.activeTabId);
        if (tab && tab.webview) {
            try {
                this.backBtn.disabled = !tab.webview.canGoBack();
                this.forwardBtn.disabled = !tab.webview.canGoForward();
            } catch (e) {
                // Webview not ready yet - set to disabled
                this.backBtn.disabled = true;
                this.forwardBtn.disabled = true;
            }
        }
    }


    // ============================================
    // UI Updates
    // ============================================

    updateUrlBar(url) {
        if (url && url !== 'about:blank') {
            this.urlInput.value = url;
        } else {
            this.urlInput.value = '';
        }
    }

    updateSecurityIndicator(url) {
        if (!url || url === 'about:blank') {
            this.securityIndicator.className = 'security-indicator';
            return;
        }

        if (url.startsWith('https://')) {
            this.securityIndicator.className = 'security-indicator secure';
        } else {
            this.securityIndicator.className = 'security-indicator insecure';
        }
    }

    setStatus(text) {
        if (this.statusText) {
            this.statusText.textContent = text;
        }
    }

    toggleNewTabPage(show) {
        const ntp = document.querySelector('.new-tab-page');
        if (ntp) {
            ntp.style.display = show ? 'flex' : 'none';
        }
    }

    // ============================================
    // Event Listeners Setup
    // ============================================

    setupNavigationListeners() {
        this.backBtn.addEventListener('click', () => this.goBack());
        this.forwardBtn.addEventListener('click', () => this.goForward());
        this.reloadBtn.addEventListener('click', () => this.reload());
        this.homeBtn.addEventListener('click', () => this.goHome());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl+T: New tab
            if (e.ctrlKey && e.key === 't') {
                e.preventDefault();
                this.createTab();
            }
            // Ctrl+W: Close tab
            if (e.ctrlKey && e.key === 'w') {
                e.preventDefault();
                this.closeTab(this.activeTabId);
            }
            // Ctrl+R or F5: Reload
            if ((e.ctrlKey && e.key === 'r') || e.key === 'F5') {
                e.preventDefault();
                this.reload();
            }
            // Alt+Left: Back
            if (e.altKey && e.key === 'ArrowLeft') {
                e.preventDefault();
                this.goBack();
            }
            // Alt+Right: Forward
            if (e.altKey && e.key === 'ArrowRight') {
                e.preventDefault();
                this.goForward();
            }
            // Ctrl+L: Focus URL bar
            if (e.ctrlKey && e.key === 'l') {
                e.preventDefault();
                this.urlInput.focus();
                this.urlInput.select();
            }
            // Escape: Stop loading / blur URL bar
            if (e.key === 'Escape') {
                if (document.activeElement === this.urlInput) {
                    this.urlInput.blur();
                } else {
                    const tab = this.tabs.get(this.activeTabId);
                    if (tab && tab.webview) {
                        tab.webview.stop();
                    }
                }
            }
            // F12: Open DevTools for current webview
            if (e.key === 'F12') {
                e.preventDefault();
                this.openDevTools();
            }
        });
    }

    setupUrlInputListeners() {
        this.urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const value = this.urlInput.value.trim();
                if (value) {
                    this.navigate(value);
                    this.urlInput.blur();
                }
            }
        });

        this.urlInput.addEventListener('focus', () => {
            this.urlInput.select();
        });
    }

    setupNewTabListener() {
        this.newTabBtn.addEventListener('click', () => {
            this.createTab();
        });
    }

    setupSearchInputListener() {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const query = searchInput.value.trim();
                    if (query) {
                        this.navigate(query);
                    }
                }
            });
        }

        // Quick links
        document.querySelectorAll('.quick-link[data-url]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const url = link.dataset.url;
                this.navigate(url);
            });
        });
    }

    // ============================================
    // Knowledge Mode - Content Extraction
    // ============================================

    extractPageContent(tabId, webview) {
        // Check if Knowledge Mode is enabled
        if (!window.knowledgeManager || !window.knowledgeManager.isKnowledgeModeEnabled()) {
            return; // Knowledge Mode is OFF, skip extraction
        }

        const tab = this.tabs.get(tabId);
        if (!tab || !webview) return;

        // Don't extract from about:blank or empty pages
        const currentUrl = tab.url;
        if (!currentUrl || currentUrl === 'about:blank') return;

        // Execute JavaScript in the webview to extract content
        const extractionScript = `
            (function() {
                // Helper to get text content and clean it
                const getText = (el) => el.textContent.trim();
                
                // Helper to get array of text from elements
                const getTextArray = (selector) => {
                    return Array.from(document.querySelectorAll(selector))
                        .map(el => getText(el))
                        .filter(text => text.length > 0);
                };

                // Extract all content
                return {
                    url: window.location.href,
                    title: document.title || '',
                    headings: getTextArray('h1'),
                    subHeadings: getTextArray('h2'),
                    paragraphs: getTextArray('p').slice(0, 50), // Limit to first 50 paragraphs
                    lists: getTextArray('li').slice(0, 100), // Limit to first 100 list items
                    timestamp: new Date().toISOString()
                };
            })();
        `;

        webview.executeJavaScript(extractionScript)
            .then(pageContent => {
                if (pageContent && pageContent.url) {
                    // Log the extracted content for testing
                    // Classify the content using the Knowledge Classifier
                    if (window.knowledgeClassifier) {
                        const classifiedContent = window.knowledgeClassifier.classify(pageContent);

                        if (classifiedContent) {
                            // Dispatch event with classified content
                            window.dispatchEvent(new CustomEvent('pageContentClassified', {
                                detail: { tabId, content: classifiedContent }
                            }));
                        }
                    }

                    // Dispatch event for other parts of the app to use
                    window.dispatchEvent(new CustomEvent('pageContentExtracted', {
                        detail: { tabId, content: pageContent }
                    }));
                }
            })
            .catch(err => {
            });
    }
}

// ============================================
// Theme Manager
// ============================================
class ThemeManager {
    constructor() {
        this.themeToggle = document.getElementById('themeToggle');
        this.init();
    }

    init() {
        // Load saved theme
        const savedTheme = localStorage.getItem('focusflow-theme') || 'dark';
        this.setTheme(savedTheme);

        // Toggle listener
        if (this.themeToggle) {
            this.themeToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const currentTheme = document.documentElement.getAttribute('data-theme');
                const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
                this.setTheme(newTheme);
            });
        } else {
        }
    }

    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('focusflow-theme', theme);
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        this.setTheme(newTheme);
    }

}

// ============================================
// Knowledge Manager Class
// ============================================
class KnowledgeManager {
    constructor() {
        this.storageKey = 'focusflow-knowledge-mode';
        this.isEnabled = false;

        // DOM Elements
        this.toggleBtn = document.getElementById('knowledgeToggle');
        this.labelEl = this.toggleBtn?.querySelector('.knowledge-label');

        this.init();
    }

    init() {
        // Load saved state from localStorage (default: OFF)
        this.isEnabled = this.loadState();

        // Update UI to match saved state
        this.updateUI();

        // Setup click listener
        if (this.toggleBtn) {
            this.toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggle();
            });
        } else {
        }
    }

    loadState() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            // Default to false (OFF) if not set
            return saved === 'true';
        } catch (e) {
            return false;
        }
    }

    saveState() {
        try {
            localStorage.setItem(this.storageKey, this.isEnabled.toString());
        } catch (e) {
        }
    }

    toggle() {
        this.isEnabled = !this.isEnabled;
        this.saveState();
        this.updateUI();

        // Add pulse animation when turning ON
        if (this.isEnabled && this.toggleBtn) {
            this.toggleBtn.classList.add('pulse');
            setTimeout(() => {
                this.toggleBtn.classList.remove('pulse');
            }, 500);
        }

        // Log state change for debugging
        // Dispatch custom event for other parts of the app to listen to
        window.dispatchEvent(new CustomEvent('knowledgeModeChanged', {
            detail: { enabled: this.isEnabled }
        }));
    }

    updateUI() {
        if (!this.toggleBtn) return;

        if (this.isEnabled) {
            this.toggleBtn.classList.add('active');
            this.toggleBtn.title = 'Knowledge Mode is ON - Click to disable';
            // Update label if it exists (for backward compatibility)
            if (this.labelEl) {
                this.labelEl.textContent = 'Knowledge ON';
            }
        } else {
            this.toggleBtn.classList.remove('active');
            this.toggleBtn.title = 'Knowledge Mode is OFF - Click to enable';
            if (this.labelEl) {
                this.labelEl.textContent = 'Knowledge OFF';
            }
        }
    }

    // Public method to check if knowledge mode is enabled
    isKnowledgeModeEnabled() {
        return this.isEnabled;
    }

    // Public method to enable knowledge mode programmatically
    enable() {
        if (!this.isEnabled) {
            this.toggle();
        }
    }

    // Public method to disable knowledge mode programmatically
    disable() {
        if (this.isEnabled) {
            this.toggle();
        }
    }
}

// ============================================
// Knowledge Classifier - Rule-Based Engine
// ============================================
class KnowledgeClassifier {
    constructor() {
        // Subject keyword mappings
        this.subjectKeywords = {
            'Web Development': [
                'html', 'css', 'javascript', 'react', 'vue', 'angular', 'node', 'nodejs',
                'express', 'frontend', 'backend', 'fullstack', 'web', 'dom', 'api', 'rest',
                'graphql', 'webpack', 'npm', 'yarn', 'typescript', 'sass', 'less', 'bootstrap',
                'tailwind', 'jquery', 'ajax', 'json', 'xml', 'http', 'https', 'cors', 'cookie',
                'session', 'jwt', 'oauth', 'responsive', 'mobile-first', 'pwa', 'spa', 'ssr',
                'nextjs', 'next.js', 'nuxt', 'gatsby', 'svelte', 'ember', 'backbone', 'redux',
                'zustand', 'mobx', 'context api', 'hooks', 'component', 'props', 'state'
            ],
            'Artificial Intelligence': [
                'artificial intelligence', 'ai', 'machine learning', 'ml', 'deep learning',
                'neural network', 'nlp', 'natural language', 'computer vision', 'robotics',
                'chatbot', 'gpt', 'llm', 'large language model', 'transformer', 'bert',
                'attention mechanism', 'reinforcement learning', 'supervised', 'unsupervised',
                'classification', 'regression', 'clustering', 'generative', 'discriminative',
                'gan', 'vae', 'autoencoder', 'embedding', 'token', 'prompt', 'fine-tuning',
                'rag', 'retrieval', 'inference', 'training', 'model', 'weights', 'bias'
            ],
            'Machine Learning': [
                'machine learning', 'ml', 'sklearn', 'scikit-learn', 'tensorflow', 'pytorch',
                'keras', 'xgboost', 'lightgbm', 'random forest', 'decision tree', 'svm',
                'support vector', 'naive bayes', 'knn', 'k-nearest', 'linear regression',
                'logistic regression', 'gradient descent', 'backpropagation', 'epoch',
                'batch', 'loss function', 'optimizer', 'adam', 'sgd', 'overfitting',
                'underfitting', 'regularization', 'dropout', 'cross-validation', 'accuracy',
                'precision', 'recall', 'f1', 'roc', 'auc', 'confusion matrix', 'feature',
                'label', 'dataset', 'train', 'test', 'validation', 'hyperparameter'
            ],
            'Deep Learning': [
                'deep learning', 'neural network', 'cnn', 'convolutional', 'rnn', 'recurrent',
                'lstm', 'gru', 'transformer', 'attention', 'self-attention', 'multi-head',
                'encoder', 'decoder', 'seq2seq', 'resnet', 'vgg', 'inception', 'mobilenet',
                'yolo', 'object detection', 'image classification', 'segmentation', 'unet',
                'batch normalization', 'layer normalization', 'activation', 'relu', 'sigmoid',
                'tanh', 'softmax', 'pooling', 'convolution', 'kernel', 'filter', 'stride',
                'padding', 'dense', 'fully connected', 'flatten'
            ],
            'Data Structures & Algorithms': [
                'data structure', 'algorithm', 'dsa', 'array', 'linked list', 'stack', 'queue',
                'tree', 'binary tree', 'bst', 'binary search', 'heap', 'priority queue',
                'graph', 'hash', 'hashmap', 'hashtable', 'set', 'map', 'sorting', 'searching',
                'bfs', 'dfs', 'breadth first', 'depth first', 'dijkstra', 'bellman', 'floyd',
                'dynamic programming', 'dp', 'recursion', 'memoization', 'tabulation',
                'greedy', 'backtracking', 'divide and conquer', 'merge sort', 'quick sort',
                'bubble sort', 'insertion sort', 'selection sort', 'heap sort', 'radix sort',
                'time complexity', 'space complexity', 'big o', 'o(n)', 'o(log n)', 'o(n^2)',
                'trie', 'segment tree', 'fenwick', 'union find', 'disjoint set', 'topological'
            ],
            'Cybersecurity': [
                'security', 'cybersecurity', 'cyber security', 'hacking', 'ethical hacking',
                'penetration', 'pentest', 'vulnerability', 'exploit', 'malware', 'virus',
                'trojan', 'ransomware', 'phishing', 'social engineering', 'encryption',
                'decryption', 'cryptography', 'ssl', 'tls', 'firewall', 'ids', 'ips',
                'intrusion', 'authentication', 'authorization', 'owasp', 'xss', 'sql injection',
                'csrf', 'ddos', 'dos', 'brute force', 'password', 'hash', 'salt', 'token',
                'certificate', 'public key', 'private key', 'rsa', 'aes', 'sha', 'md5',
                'vpn', 'proxy', 'tor', 'anonymity', 'forensics', 'incident response'
            ],
            'Database': [
                'database', 'sql', 'mysql', 'postgresql', 'postgres', 'mongodb', 'nosql',
                'redis', 'elasticsearch', 'sqlite', 'oracle', 'mssql', 'query', 'table',
                'schema', 'index', 'primary key', 'foreign key', 'join', 'inner join',
                'outer join', 'left join', 'right join', 'union', 'group by', 'having',
                'where', 'select', 'insert', 'update', 'delete', 'crud', 'transaction',
                'acid', 'normalization', 'denormalization', 'orm', 'prisma', 'sequelize',
                'mongoose', 'typeorm', 'migration', 'seed', 'backup', 'replication'
            ],
            'Cloud Computing': [
                'cloud', 'aws', 'amazon web services', 'azure', 'google cloud', 'gcp',
                'docker', 'kubernetes', 'k8s', 'container', 'microservices', 'serverless',
                'lambda', 'ec2', 's3', 'rds', 'dynamodb', 'cloudfront', 'cdn', 'load balancer',
                'auto scaling', 'vpc', 'subnet', 'cicd', 'ci/cd', 'devops', 'terraform',
                'ansible', 'jenkins', 'github actions', 'gitlab ci', 'deployment', 'hosting',
                'iaas', 'paas', 'saas', 'virtual machine', 'vm', 'instance', 'cluster'
            ],
            'Python': [
                'python', 'pip', 'conda', 'jupyter', 'notebook', 'pandas', 'numpy', 'scipy',
                'matplotlib', 'seaborn', 'plotly', 'flask', 'django', 'fastapi', 'celery',
                'asyncio', 'decorator', 'generator', 'iterator', 'list comprehension',
                'dictionary', 'tuple', 'set', 'lambda', 'map', 'filter', 'reduce', 'zip',
                'enumerate', 'class', 'inheritance', 'polymorphism', 'encapsulation',
                'virtual environment', 'venv', 'requirements', 'pypi'
            ],
            'Java': [
                'java', 'jvm', 'jdk', 'jre', 'spring', 'spring boot', 'hibernate', 'maven',
                'gradle', 'servlet', 'jsp', 'jdbc', 'jpa', 'bean', 'annotation', 'interface',
                'abstract', 'extends', 'implements', 'override', 'overload', 'exception',
                'try catch', 'finally', 'throw', 'throws', 'collection', 'arraylist',
                'linkedlist', 'hashmap', 'treemap', 'stream', 'lambda', 'optional', 'generics'
            ],
            'Operating Systems': [
                'operating system', 'os', 'linux', 'unix', 'windows', 'macos', 'kernel',
                'process', 'thread', 'multithreading', 'concurrency', 'parallelism',
                'scheduling', 'memory management', 'virtual memory', 'paging', 'segmentation',
                'file system', 'inode', 'ext4', 'ntfs', 'fat32', 'shell', 'bash', 'terminal',
                'command line', 'cli', 'system call', 'interrupt', 'deadlock', 'mutex',
                'semaphore', 'race condition', 'synchronization'
            ],
            'Networking': [
                'network', 'networking', 'tcp', 'udp', 'ip', 'ipv4', 'ipv6', 'osi model',
                'layer', 'protocol', 'router', 'switch', 'hub', 'gateway', 'dns', 'dhcp',
                'nat', 'port', 'socket', 'packet', 'frame', 'mac address', 'arp', 'icmp',
                'ping', 'traceroute', 'bandwidth', 'latency', 'throughput', 'lan', 'wan',
                'wifi', 'ethernet', 'fiber', '5g', 'http', 'https', 'ftp', 'ssh', 'telnet'
            ]
        };

        // Topic keyword mappings (more specific)
        this.topicKeywords = {
            // Web Development Topics
            'React': ['react', 'jsx', 'hooks', 'usestate', 'useeffect', 'usecontext', 'usereducer', 'redux', 'react router', 'create react app', 'next.js', 'nextjs'],
            'Vue': ['vue', 'vuex', 'vue router', 'nuxt', 'composition api', 'options api', 'v-model', 'v-bind', 'v-if', 'v-for'],
            'Angular': ['angular', 'typescript', 'rxjs', 'observable', 'ng', 'ngmodule', 'component', 'directive', 'pipe', 'service'],
            'Node.js': ['node', 'nodejs', 'express', 'npm', 'yarn', 'package.json', 'middleware', 'event loop', 'async await'],
            'CSS': ['css', 'flexbox', 'grid', 'sass', 'scss', 'less', 'tailwind', 'bootstrap', 'animation', 'transition', 'media query'],
            'HTML': ['html', 'html5', 'semantic', 'accessibility', 'a11y', 'form', 'input', 'canvas', 'svg', 'video', 'audio'],

            // AI/ML Topics
            'Neural Networks': ['neural network', 'perceptron', 'mlp', 'feedforward', 'backpropagation', 'activation function', 'weights', 'bias'],
            'CNN': ['cnn', 'convolutional', 'convolution', 'pooling', 'kernel', 'filter', 'feature map', 'image classification'],
            'RNN': ['rnn', 'recurrent', 'lstm', 'gru', 'sequence', 'time series', 'vanishing gradient'],
            'Transformers': ['transformer', 'attention', 'self-attention', 'bert', 'gpt', 'encoder decoder', 'positional encoding'],
            'NLP': ['nlp', 'natural language', 'tokenization', 'embedding', 'word2vec', 'sentiment', 'ner', 'named entity'],
            'Computer Vision': ['computer vision', 'image processing', 'object detection', 'segmentation', 'opencv', 'yolo', 'resnet'],

            // DSA Topics
            'Arrays': ['array', 'subarray', 'sliding window', 'two pointer', 'prefix sum', 'kadane'],
            'Linked Lists': ['linked list', 'singly linked', 'doubly linked', 'circular', 'node', 'pointer', 'reverse linked'],
            'Trees': ['tree', 'binary tree', 'bst', 'avl', 'red black', 'b-tree', 'traversal', 'inorder', 'preorder', 'postorder'],
            'Graphs': ['graph', 'vertex', 'edge', 'adjacency', 'bfs', 'dfs', 'dijkstra', 'bellman ford', 'floyd warshall', 'mst', 'prim', 'kruskal'],
            'Dynamic Programming': ['dynamic programming', 'dp', 'memoization', 'tabulation', 'optimal substructure', 'overlapping subproblems'],
            'Sorting': ['sorting', 'sort', 'merge sort', 'quick sort', 'heap sort', 'bubble sort', 'insertion sort', 'selection sort'],
            'Searching': ['searching', 'binary search', 'linear search', 'interpolation search', 'exponential search'],
            'Hashing': ['hash', 'hashmap', 'hashtable', 'collision', 'chaining', 'open addressing', 'hash function'],

            // Python Topics
            'Python Basics': ['python basics', 'variables', 'data types', 'operators', 'control flow', 'loops', 'functions'],
            'Pandas': ['pandas', 'dataframe', 'series', 'csv', 'excel', 'groupby', 'merge', 'pivot'],
            'NumPy': ['numpy', 'array', 'ndarray', 'vectorization', 'broadcasting', 'linear algebra'],
            'Django': ['django', 'orm', 'views', 'templates', 'urls', 'models', 'admin', 'rest framework'],
            'Flask': ['flask', 'route', 'blueprint', 'jinja', 'werkzeug', 'sqlalchemy'],

            // Database Topics
            'SQL': ['sql', 'query', 'select', 'join', 'where', 'group by', 'having', 'order by', 'subquery'],
            'MongoDB': ['mongodb', 'mongoose', 'document', 'collection', 'aggregation', 'pipeline', 'nosql'],
            'PostgreSQL': ['postgresql', 'postgres', 'psql', 'jsonb', 'array', 'window function', 'cte'],

            // Security Topics
            'Web Security': ['xss', 'csrf', 'sql injection', 'owasp', 'sanitization', 'validation', 'cors'],
            'Cryptography': ['cryptography', 'encryption', 'decryption', 'hash', 'rsa', 'aes', 'sha', 'certificate'],
            'Network Security': ['firewall', 'ids', 'ips', 'vpn', 'ssl', 'tls', 'https', 'penetration testing']
        };

        // Chapter/Level keyword mappings
        this.chapterKeywords = {
            'Introduction': ['introduction', 'intro', 'getting started', 'what is', 'overview', 'basics', 'beginner', 'fundamentals', 'first steps', 'hello world', 'setup', 'installation'],
            'Basics': ['basic', 'basics', 'fundamental', 'core', 'essential', 'primary', 'elementary', 'simple', 'easy', 'starter'],
            'Intermediate': ['intermediate', 'moderate', 'medium', 'practical', 'hands-on', 'real-world', 'application', 'implementation'],
            'Advanced': ['advanced', 'complex', 'expert', 'professional', 'in-depth', 'deep dive', 'mastery', 'senior', 'sophisticated'],
            'Optimization': ['optimization', 'optimize', 'performance', 'efficient', 'efficiency', 'speed', 'fast', 'memory', 'best practices', 'tips', 'tricks'],
            'Architecture': ['architecture', 'design pattern', 'pattern', 'structure', 'system design', 'scalability', 'microservices', 'monolith'],
            'Debugging': ['debug', 'debugging', 'troubleshoot', 'error', 'bug', 'fix', 'issue', 'problem', 'solution'],
            'Testing': ['testing', 'test', 'unit test', 'integration', 'e2e', 'end-to-end', 'jest', 'mocha', 'pytest', 'tdd', 'bdd'],
            'Deployment': ['deployment', 'deploy', 'production', 'hosting', 'server', 'ci/cd', 'pipeline', 'release'],
            'Security': ['security', 'secure', 'authentication', 'authorization', 'vulnerability', 'protection']
        };
    }

    // Main classification method
    classify(pageContent) {
        if (!pageContent) return null;

        // Combine all text for analysis
        const allText = this.getAllText(pageContent).toLowerCase();

        // Detect subject, topic, and chapter
        const subject = this.detectSubject(allText);
        const topic = this.detectTopic(allText);
        const chapter = this.detectChapter(allText);

        // Extract key points from headings
        const keyPoints = this.extractKeyPoints(pageContent);

        // Build classified object
        const classifiedContent = {
            subject: subject || 'General',
            topic: topic || 'Miscellaneous',
            chapter: chapter || 'General',
            url: pageContent.url || '',
            title: pageContent.title || '',
            keyPoints: keyPoints,
            paragraphs: pageContent.paragraphs || [],
            timestamp: pageContent.timestamp || new Date().toISOString()
        };

        return classifiedContent;
    }

    // Combine all text from page content
    getAllText(pageContent) {
        const parts = [
            pageContent.url || '',
            pageContent.title || '',
            ...(pageContent.headings || []),
            ...(pageContent.subHeadings || []),
            ...(pageContent.paragraphs || []).slice(0, 20), // First 20 paragraphs
            ...(pageContent.lists || []).slice(0, 30) // First 30 list items
        ];
        return parts.join(' ');
    }

    // Detect subject using keyword matching
    detectSubject(text) {
        let bestMatch = null;
        let highestScore = 0;

        for (const [subject, keywords] of Object.entries(this.subjectKeywords)) {
            const score = this.calculateScore(text, keywords);
            if (score > highestScore) {
                highestScore = score;
                bestMatch = subject;
            }
        }

        return highestScore >= 2 ? bestMatch : null; // Require at least 2 keyword matches
    }

    // Detect topic using keyword matching
    detectTopic(text) {
        let bestMatch = null;
        let highestScore = 0;

        for (const [topic, keywords] of Object.entries(this.topicKeywords)) {
            const score = this.calculateScore(text, keywords);
            if (score > highestScore) {
                highestScore = score;
                bestMatch = topic;
            }
        }

        return highestScore >= 1 ? bestMatch : null; // Require at least 1 keyword match
    }

    // Detect chapter/level using keyword matching
    detectChapter(text) {
        let bestMatch = null;
        let highestScore = 0;

        for (const [chapter, keywords] of Object.entries(this.chapterKeywords)) {
            const score = this.calculateScore(text, keywords);
            if (score > highestScore) {
                highestScore = score;
                bestMatch = chapter;
            }
        }

        return highestScore >= 1 ? bestMatch : null;
    }

    // Calculate keyword match score
    calculateScore(text, keywords) {
        let score = 0;
        for (const keyword of keywords) {
            // Use word boundary matching for more accurate results
            const regex = new RegExp(`\\b${this.escapeRegex(keyword)}\\b`, 'gi');
            const matches = text.match(regex);
            if (matches) {
                score += matches.length;
            }
        }
        return score;
    }

    // Escape special regex characters
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // Extract key points from headings
    extractKeyPoints(pageContent) {
        const keyPoints = [];

        // Add H1 headings
        if (pageContent.headings) {
            keyPoints.push(...pageContent.headings.slice(0, 3));
        }

        // Add H2 subheadings
        if (pageContent.subHeadings) {
            keyPoints.push(...pageContent.subHeadings.slice(0, 7));
        }

        // Limit to 10 key points
        return keyPoints.slice(0, 10);
    }
}

// ============================================
// Rule-Based Summarizer - 100% Offline Engine
// ============================================
class RuleBasedSummarizer {
    constructor() {
        // Definition trigger phrases
        this.definitionPatterns = [
            /\b(?:is|are)\s+(?:a|an|the)?\s*(?:type|kind|form|method|process|way|technique|approach|concept|principle)/i,
            /\b(?:is|are)\s+defined\s+as\b/i,
            /\b(?:is|are)\s+known\s+as\b/i,
            /\b(?:means|refers?\s+to|represents?)\b/i,
            /\b(?:is|are)\s+(?:a|an)\s+\w+\s+(?:that|which|where)\b/i,
            /\b(?:can\s+be\s+defined\s+as)\b/i
        ];

        // Example trigger phrases
        this.examplePatterns = [
            /\bfor\s+example\b/i,
            /\bsuch\s+as\b/i,
            /\bin\s+(?:the\s+)?real[\s-]?world\b/i,
            /\bused\s+in\b/i,
            /\bfor\s+instance\b/i,
            /\be\.g\.\b/i,
            /\blike\s+(?:the\s+)?\w+(?:\s+and\s+\w+)*/i,
            /\bin\s+practice\b/i,
            /\breal[\s-]?life\s+(?:example|application|use)/i
        ];

        // Stop words to ignore when calculating keyword frequency
        this.stopWords = new Set([
            'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
            'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
            'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by',
            'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above',
            'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here',
            'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more',
            'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
            'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or',
            'because', 'until', 'while', 'this', 'that', 'these', 'those', 'it',
            'its', 'he', 'she', 'they', 'them', 'his', 'her', 'their', 'what',
            'which', 'who', 'whom', 'whose', 'i', 'you', 'we', 'our', 'your', 'my'
        ]);
    }

    // Main summarization entry point
    summarize(pageContent) {
        if (!pageContent) {
            return { summaryPoints: [], definitions: [], examples: [] };
        }

        const paragraphs = pageContent.paragraphs || [];
        const headings = [...(pageContent.headings || []), ...(pageContent.subHeadings || [])];
        const lists = pageContent.lists || [];

        // Combine paragraphs and list items for analysis
        const allText = [...paragraphs, ...lists];

        // Generate the summary components
        const summaryPoints = this.generateSummary(allText, headings);
        const definitions = this.extractDefinitions(allText);
        const examples = this.extractExamples(allText);

        return {
            summaryPoints,
            definitions,
            examples
        };
    }

    // Generate top 5 summary sentences based on scoring
    generateSummary(paragraphs, headings) {
        // Split all paragraphs into sentences
        const allSentences = [];
        paragraphs.forEach((paragraph, paragraphIndex) => {
            const sentences = this.splitIntoSentences(paragraph);
            sentences.forEach(sentence => {
                const cleaned = this.cleanSentence(sentence);
                if (cleaned.length > 30) { // Only consider meaningful sentences
                    allSentences.push({
                        text: cleaned,
                        paragraphIndex,
                        originalParagraph: paragraph
                    });
                }
            });
        });

        if (allSentences.length === 0) {
            return [];
        }

        // Calculate keyword frequency across all sentences
        const keywordFreq = this.calculateKeywordFrequency(allSentences.map(s => s.text));

        // Calculate heading keywords for proximity scoring
        const headingKeywords = this.extractHeadingKeywords(headings);

        // Score each sentence
        const scoredSentences = allSentences.map((sentenceObj, index) => {
            const score = this.scoreSentence(
                sentenceObj.text,
                keywordFreq,
                headingKeywords,
                sentenceObj.paragraphIndex,
                allSentences.length
            );
            return { ...sentenceObj, score, index };
        });

        // Sort by score descending and pick top 5 unique sentences
        scoredSentences.sort((a, b) => b.score - a.score);

        const uniqueSentences = [];
        const seen = new Set();
        for (const s of scoredSentences) {
            const normalized = s.text.toLowerCase().substring(0, 50);
            if (!seen.has(normalized) && uniqueSentences.length < 5) {
                seen.add(normalized);
                uniqueSentences.push(s.text);
            }
        }

        return uniqueSentences;
    }

    // Extract definitions (sentences with "is", "are", "means", "refers to")
    extractDefinitions(paragraphs) {
        const definitions = [];
        const seen = new Set();

        for (const paragraph of paragraphs) {
            const sentences = this.splitIntoSentences(paragraph);
            for (const sentence of sentences) {
                const cleaned = this.cleanSentence(sentence);
                if (cleaned.length < 30 || cleaned.length > 300) continue;

                // Check if sentence matches definition patterns
                const isDefinition = this.definitionPatterns.some(pattern => pattern.test(cleaned));
                if (isDefinition) {
                    const normalized = cleaned.toLowerCase().substring(0, 50);
                    if (!seen.has(normalized)) {
                        seen.add(normalized);
                        definitions.push(cleaned);
                    }
                }

                if (definitions.length >= 3) break;
            }
            if (definitions.length >= 3) break;
        }

        return definitions.slice(0, 3);
    }

    // Extract real-world examples
    extractExamples(paragraphs) {
        const examples = [];
        const seen = new Set();

        for (const paragraph of paragraphs) {
            const sentences = this.splitIntoSentences(paragraph);
            for (const sentence of sentences) {
                const cleaned = this.cleanSentence(sentence);
                if (cleaned.length < 30 || cleaned.length > 300) continue;

                // Check if sentence matches example patterns
                const isExample = this.examplePatterns.some(pattern => pattern.test(cleaned));
                if (isExample) {
                    const normalized = cleaned.toLowerCase().substring(0, 50);
                    if (!seen.has(normalized)) {
                        seen.add(normalized);
                        examples.push(cleaned);
                    }
                }

                if (examples.length >= 2) break;
            }
            if (examples.length >= 2) break;
        }

        return examples.slice(0, 2);
    }

    // Split text into sentences
    splitIntoSentences(text) {
        if (!text) return [];
        // Split on common sentence terminators
        return text
            .split(/(?<=[.!?])\s+/)
            .map(s => s.trim())
            .filter(s => s.length > 0);
    }

    // Clean a sentence by removing symbols and extra spaces
    cleanSentence(sentence) {
        if (!sentence) return '';
        return sentence
            .replace(/\s+/g, ' ')           // Normalize whitespace
            .replace(/[^\w\s.,!?;:'\-()]/g, '') // Remove special symbols
            .replace(/\s+([.,!?;:])/g, '$1') // Fix punctuation spacing
            .trim();
    }

    // Calculate keyword frequency across all text
    calculateKeywordFrequency(sentences) {
        const freq = new Map();
        const allText = sentences.join(' ').toLowerCase();
        const words = allText.match(/\b[a-z]{4,}\b/g) || [];

        for (const word of words) {
            if (!this.stopWords.has(word)) {
                freq.set(word, (freq.get(word) || 0) + 1);
            }
        }

        return freq;
    }

    // Extract keywords from headings for proximity scoring
    extractHeadingKeywords(headings) {
        const keywords = new Set();
        for (const heading of headings) {
            const words = heading.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
            for (const word of words) {
                if (!this.stopWords.has(word)) {
                    keywords.add(word);
                }
            }
        }
        return keywords;
    }

    // Score a sentence based on multiple factors
    scoreSentence(sentence, keywordFreq, headingKeywords, paragraphIndex, totalSentences) {
        let score = 0;
        const lowerSentence = sentence.toLowerCase();
        const words = lowerSentence.match(/\b[a-z]{4,}\b/g) || [];

        // Factor 1: Keyword frequency score (repeated important words)
        for (const word of words) {
            const freq = keywordFreq.get(word) || 0;
            if (freq > 1) {
                score += Math.min(freq, 5); // Cap at 5 to avoid over-weighting
            }
        }

        // Factor 2: Heading proximity (contains words from headings)
        for (const word of words) {
            if (headingKeywords.has(word)) {
                score += 3; // Boost for heading-related words
            }
        }

        // Factor 3: Position bonus (earlier paragraphs often contain key info)
        if (paragraphIndex < 3) {
            score += 5 - paragraphIndex;
        }

        // Factor 4: Meaningful length bonus (not too short, not too long)
        const length = sentence.length;
        if (length >= 60 && length <= 200) {
            score += 2;
        } else if (length > 200 && length <= 300) {
            score += 1;
        }

        // Factor 5: Contains informative patterns
        if (/\b(important|key|main|primary|essential|significant|crucial)\b/i.test(sentence)) {
            score += 2;
        }
        if (/\b(first|second|third|finally|moreover|furthermore|however)\b/i.test(sentence)) {
            score += 1;
        }

        return score;
    }
}

// ============================================
// Summary Modal UI - Chrome-Style Display
// ============================================
class SummaryModalUI {
    constructor() {
        this.modalOverlay = null;
        this.createModal();
    }

    // Create the modal DOM structure
    createModal() {
        // Check if modal already exists
        if (document.getElementById('summaryModalOverlay')) {
            this.modalOverlay = document.getElementById('summaryModalOverlay');
            return;
        }

        // Create modal overlay
        this.modalOverlay = document.createElement('div');
        this.modalOverlay.id = 'summaryModalOverlay';
        this.modalOverlay.className = 'summary-modal-overlay';

        this.modalOverlay.innerHTML = `
            <div class="summary-modal">
                <div class="summary-modal-header">
                    <div class="summary-modal-title">
                        <span class="summary-modal-title-icon">✨</span>
                        <span>Page Summary</span>
                    </div>
                    <button class="summary-modal-close" id="summaryModalClose" title="Close">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
                <div class="summary-modal-body" id="summaryModalBody">
                    <!-- Content populated dynamically -->
                </div>
            </div>
            <div class="main-menu-item" id="menuDevTools">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="16 18 22 12 16 6"></polyline>
                    <polyline points="8 6 2 12 8 18"></polyline>
                </svg>
                开发者工具
            </div>
        `;

        document.body.appendChild(this.modalOverlay);

        // Setup event listeners
        this.setupEventListeners();
    }

    // Setup modal event listeners
    setupEventListeners() {
        // Close button
        const closeBtn = document.getElementById('summaryModalClose');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hideSummaryModal());
        }

        // Click outside to close
        this.modalOverlay.addEventListener('click', (e) => {
            if (e.target === this.modalOverlay) {
                this.hideSummaryModal();
            }
        });

        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modalOverlay.classList.contains('open')) {
                this.hideSummaryModal();
            }
        });
    }

    // Show the summary modal with data
    showSummaryModal(summaryData) {
        const body = document.getElementById('summaryModalBody');
        if (!body) return;

        // Clear previous content
        body.innerHTML = '';

        // Summary Points Section
        body.appendChild(this.renderSection(
            'Summary',
            '📋',
            summaryData.summaryPoints,
            'summary-list',
            'li'
        ));

        // Definitions Section
        body.appendChild(this.renderSection(
            'Key Definitions',
            '📖',
            summaryData.definitions,
            'summary-definitions',
            'definition'
        ));

        // Real-World Examples Section
        body.appendChild(this.renderSection(
            'Real-World Examples',
            '🌍',
            summaryData.examples,
            'summary-examples',
            'example'
        ));

        // Show the modal
        this.modalOverlay.classList.add('open');
    }

    // Hide the summary modal
    hideSummaryModal() {
        if (this.modalOverlay) {
            this.modalOverlay.classList.remove('open');
        }
    }

    // Render a section with title, icon, and items
    renderSection(title, icon, items, containerClass, itemType) {
        const section = document.createElement('div');
        section.className = 'summary-section';

        const header = document.createElement('div');
        header.className = 'summary-section-header';
        header.innerHTML = `
            <span class="summary-section-icon">${icon}</span>
            <span class="summary-section-title">${title}</span>
        `;
        section.appendChild(header);

        if (!items || items.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'summary-empty';
            empty.textContent = `No ${title.toLowerCase()} found on this page.`;
            section.appendChild(empty);
        } else if (itemType === 'li') {
            const list = document.createElement('ul');
            list.className = 'summary-list';
            items.forEach(item => {
                const li = document.createElement('li');
                li.textContent = item;
                list.appendChild(li);
            });
            section.appendChild(list);
        } else if (itemType === 'definition') {
            items.forEach(item => {
                const div = document.createElement('div');
                div.className = 'summary-definition';
                div.textContent = item;
                section.appendChild(div);
            });
        } else if (itemType === 'example') {
            items.forEach(item => {
                const div = document.createElement('div');
                div.className = 'summary-example';
                div.textContent = item;
                section.appendChild(div);
            });
        }

        return section;
    }
}

// ============================================
// Knowledge Database - IndexedDB Storage
// ============================================
class KnowledgeDB {
    constructor() {
        this.dbName = 'FlowmoraKnowledgeDB';
        this.dbVersion = 1;
        this.storeName = 'knowledge';
        this.db = null;
        this.isReady = false;
        this.readyPromise = this.initKnowledgeDB();
    }

    // Initialize the IndexedDB database
    async initKnowledgeDB() {
        return new Promise((resolve, reject) => {
            if (this.db) {
                this.isReady = true;
                resolve(this.db);
                return;
            }

            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = (event) => {
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.isReady = true;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create the knowledge object store if it doesn't exist
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, {
                        keyPath: 'id',
                        autoIncrement: true
                    });

                    // Create indexes for efficient querying
                    store.createIndex('subject', 'subject', { unique: false });
                    store.createIndex('topic', 'topic', { unique: false });
                    store.createIndex('chapter', 'chapter', { unique: false });
                    store.createIndex('url', 'url', { unique: false });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('subject_topic', ['subject', 'topic'], { unique: false });
                }
            };
        });
    }

    // Ensure database is ready before operations
    async ensureReady() {
        if (!this.isReady) {
            await this.readyPromise;
        }
        return this.db;
    }

    // Save a knowledge entry to the database
    async saveKnowledgeEntry(entry) {
        await this.ensureReady();

        return new Promise((resolve, reject) => {
            // Validate required fields
            if (!entry || !entry.url) {
                reject(new Error('Invalid entry: URL is required'));
                return;
            }

            // Prepare the entry with all required fields
            const knowledgeEntry = {
                subject: entry.subject || 'General',
                topic: entry.topic || 'Miscellaneous',
                chapter: entry.chapter || 'General',
                url: entry.url,
                title: entry.title || '',
                keyPoints: entry.keyPoints || [],
                paragraphs: entry.paragraphs || [],
                timestamp: entry.timestamp || new Date().toISOString(),
                savedAt: new Date().toISOString()
            };

            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.add(knowledgeEntry);

            request.onsuccess = (event) => {
                const id = event.target.result;
                resolve({ ...knowledgeEntry, id });
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    // Get all knowledge entries
    async getAllKnowledge() {
        await this.ensureReady();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();

            request.onsuccess = (event) => {
                const entries = event.target.result;
                resolve(entries);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    // Get knowledge entries by subject
    async getKnowledgeBySubject(subject) {
        await this.ensureReady();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('subject');
            const request = index.getAll(subject);

            request.onsuccess = (event) => {
                const entries = event.target.result;
                resolve(entries);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    // Get knowledge entries by topic
    async getKnowledgeByTopic(topic) {
        await this.ensureReady();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('topic');
            const request = index.getAll(topic);

            request.onsuccess = (event) => {
                const entries = event.target.result;
                resolve(entries);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    // Get knowledge entries by chapter
    async getKnowledgeByChapter(chapter) {
        await this.ensureReady();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('chapter');
            const request = index.getAll(chapter);

            request.onsuccess = (event) => {
                const entries = event.target.result;
                resolve(entries);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    // Get knowledge entry by ID
    async getKnowledgeById(id) {
        await this.ensureReady();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(id);

            request.onsuccess = (event) => {
                resolve(event.target.result);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    // Delete a knowledge entry by ID
    async deleteKnowledgeEntry(id) {
        await this.ensureReady();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(id);

            request.onsuccess = () => {
                resolve(true);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    // Delete all knowledge entries
    async clearAllKnowledge() {
        await this.ensureReady();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();

            request.onsuccess = () => {
                resolve(true);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    // Check if URL already exists in the database
    async hasURL(url) {
        await this.ensureReady();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('url');
            const request = index.getAll(url);

            request.onsuccess = (event) => {
                resolve(event.target.result.length > 0);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    // Get knowledge entries by URL
    async getKnowledgeByURL(url) {
        await this.ensureReady();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('url');
            const request = index.getAll(url);

            request.onsuccess = (event) => {
                resolve(event.target.result);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    // Get unique subjects
    async getUniqueSubjects() {
        const allEntries = await this.getAllKnowledge();
        const subjects = [...new Set(allEntries.map(e => e.subject))];
        return subjects.sort();
    }

    // Get unique topics
    async getUniqueTopics() {
        const allEntries = await this.getAllKnowledge();
        const topics = [...new Set(allEntries.map(e => e.topic))];
        return topics.sort();
    }

    // Get knowledge count
    async getKnowledgeCount() {
        await this.ensureReady();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.count();

            request.onsuccess = (event) => {
                resolve(event.target.result);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    // Search knowledge by text (searches in title, keyPoints, and paragraphs)
    async searchKnowledge(query) {
        const allEntries = await this.getAllKnowledge();
        const queryLower = query.toLowerCase();

        return allEntries.filter(entry => {
            // Search in title
            if (entry.title && entry.title.toLowerCase().includes(queryLower)) {
                return true;
            }
            // Search in keyPoints
            if (entry.keyPoints && entry.keyPoints.some(kp => kp.toLowerCase().includes(queryLower))) {
                return true;
            }
            // Search in paragraphs
            if (entry.paragraphs && entry.paragraphs.some(p => p.toLowerCase().includes(queryLower))) {
                return true;
            }
            // Search in subject/topic/chapter
            if (entry.subject && entry.subject.toLowerCase().includes(queryLower)) {
                return true;
            }
            if (entry.topic && entry.topic.toLowerCase().includes(queryLower)) {
                return true;
            }
            return false;
        });
    }

    // Get statistics about stored knowledge
    async getStatistics() {
        const allEntries = await this.getAllKnowledge();

        const subjectCounts = {};
        const topicCounts = {};
        const chapterCounts = {};

        allEntries.forEach(entry => {
            subjectCounts[entry.subject] = (subjectCounts[entry.subject] || 0) + 1;
            topicCounts[entry.topic] = (topicCounts[entry.topic] || 0) + 1;
            chapterCounts[entry.chapter] = (chapterCounts[entry.chapter] || 0) + 1;
        });

        return {
            totalEntries: allEntries.length,
            subjectCounts,
            topicCounts,
            chapterCounts,
            uniqueSubjects: Object.keys(subjectCounts).length,
            uniqueTopics: Object.keys(topicCounts).length,
            uniqueChapters: Object.keys(chapterCounts).length
        };
    }
}

// ============================================
// Knowledge Panel Manager - UI Controller
// ============================================
class KnowledgePanelManager {
    constructor() {
        this.panel = document.getElementById('knowledgePanel');
        this.closeBtn = document.getElementById('knowledgePanelClose');
        this.searchInput = document.getElementById('knowledgeSearch');
        this.subjectList = document.getElementById('subjectList');
        this.subjectCount = document.getElementById('subjectCount');
        this.totalEntries = document.getElementById('totalEntries');
        this.topicsGrid = document.getElementById('topicsGrid');
        this.notesList = document.getElementById('notesList');
        this.detailContent = document.getElementById('detailContent');

        // Views
        this.emptyView = document.getElementById('knowledgeEmpty');
        this.topicsView = document.getElementById('topicsView');
        this.notesView = document.getElementById('notesView');
        this.detailView = document.getElementById('detailView');
        this.breadcrumb = document.getElementById('breadcrumb');
        this.notesBreadcrumb = document.getElementById('notesBreadcrumb');

        // State
        this.isOpen = false;
        this.currentSubject = null;
        this.currentTopic = null;
        this.currentEntry = null;
        this.allEntries = [];
        this.searchTimeout = null;

        this.init();
    }

    init() {
        // Close button
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.close());
        }

        // Back button in detail view
        const detailBackBtn = document.getElementById('detailBackBtn');
        if (detailBackBtn) {
            detailBackBtn.addEventListener('click', () => this.navigateBack());
        }

        // Delete button in detail view
        const detailDeleteBtn = document.getElementById('detailDeleteBtn');
        if (detailDeleteBtn) {
            detailDeleteBtn.addEventListener('click', () => this.deleteCurrentEntry());
        }

        // Search input
        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => {
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                    this.handleSearch(e.target.value);
                }, 300);
            });
        }

        // ESC key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
    }

    async open() {
        if (!this.panel) return;

        this.isOpen = true;
        this.panel.classList.add('open');

        // Load data
        await this.loadData();

        // Focus search
        if (this.searchInput) {
            setTimeout(() => this.searchInput.focus(), 100);
        }
    }

    close() {
        if (!this.panel) return;

        this.isOpen = false;
        this.panel.classList.remove('open');
        this.resetState();
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    resetState() {
        this.currentSubject = null;
        this.currentTopic = null;
        this.currentEntry = null;
        if (this.searchInput) {
            this.searchInput.value = '';
        }
    }

    async loadData() {
        if (!window.knowledgeDB) return;

        try {
            this.allEntries = await window.knowledgeDB.getAllKnowledge();

            // Update stats
            this.updateStats();

            // Render sidebar
            this.renderSubjectsSidebar();

            // Show appropriate view
            if (this.allEntries.length === 0) {
                this.showView('empty');
            } else {
                this.showView('topics');
                this.renderTopicsGrid();
            }
        } catch (err) {
        }
    }

    updateStats() {
        const subjects = [...new Set(this.allEntries.map(e => e.subject))];

        if (this.subjectCount) {
            this.subjectCount.textContent = subjects.length;
        }
        if (this.totalEntries) {
            this.totalEntries.textContent = this.allEntries.length;
        }
    }

    // ============================================
    // View Management
    // ============================================

    showView(view) {
        // Hide all views
        if (this.emptyView) this.emptyView.style.display = 'none';
        if (this.topicsView) this.topicsView.style.display = 'none';
        if (this.notesView) this.notesView.style.display = 'none';
        if (this.detailView) this.detailView.style.display = 'none';

        // Show requested view
        switch (view) {
            case 'empty':
                if (this.emptyView) this.emptyView.style.display = 'flex';
                break;
            case 'topics':
                if (this.topicsView) this.topicsView.style.display = 'block';
                break;
            case 'notes':
                if (this.notesView) this.notesView.style.display = 'block';
                break;
            case 'detail':
                if (this.detailView) this.detailView.style.display = 'flex';
                break;
        }
    }

    // ============================================
    // Sidebar Rendering
    // ============================================

    renderSubjectsSidebar() {
        if (!this.subjectList) return;

        // Get unique subjects with counts
        const subjectCounts = {};
        this.allEntries.forEach(entry => {
            subjectCounts[entry.subject] = (subjectCounts[entry.subject] || 0) + 1;
        });

        const subjects = Object.keys(subjectCounts).sort();

        if (subjects.length === 0) {
            this.subjectList.innerHTML = `
                <div class="sidebar-empty" style="padding: 20px; text-align: center; color: var(--text-tertiary); font-size: 12px;">
                    No subjects yet
                </div>
            `;
            return;
        }

        this.subjectList.innerHTML = `
            <div class="sidebar-item ${!this.currentSubject ? 'active' : ''}" data-subject="">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                </svg>
                <span>All</span>
                <span class="sidebar-item-count">${this.allEntries.length}</span>
            </div>
            ${subjects.map(subject => `
                <div class="sidebar-item ${this.currentSubject === subject ? 'active' : ''}" data-subject="${subject}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                    <span>${subject}</span>
                    <span class="sidebar-item-count">${subjectCounts[subject]}</span>
                </div>
            `).join('')}
        `;

        // Add click handlers
        this.subjectList.querySelectorAll('.sidebar-item').forEach(item => {
            item.addEventListener('click', () => {
                const subject = item.dataset.subject;
                this.selectSubject(subject || null);
            });
        });
    }

    selectSubject(subject) {
        this.currentSubject = subject;
        this.currentTopic = null;

        // Update sidebar active state
        this.subjectList.querySelectorAll('.sidebar-item').forEach(item => {
            item.classList.toggle('active', item.dataset.subject === (subject || ''));
        });

        // Render topics
        this.showView('topics');
        this.renderTopicsGrid();
        this.updateBreadcrumb();
    }

    // ============================================
    // Topics Grid Rendering
    // ============================================

    renderTopicsGrid() {
        if (!this.topicsGrid) return;

        // Filter by current subject if selected
        let entries = this.currentSubject
            ? this.allEntries.filter(e => e.subject === this.currentSubject)
            : this.allEntries;

        // Group by topic
        const topicCounts = {};
        const topicLatest = {};
        entries.forEach(entry => {
            topicCounts[entry.topic] = (topicCounts[entry.topic] || 0) + 1;
            if (!topicLatest[entry.topic] || entry.timestamp > topicLatest[entry.topic]) {
                topicLatest[entry.topic] = entry.timestamp;
            }
        });

        const topics = Object.keys(topicCounts).sort();

        if (topics.length === 0) {
            this.topicsGrid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-tertiary);">
                    No topics found for this subject
                </div>
            `;
            return;
        }

        this.topicsGrid.innerHTML = topics.map(topic => `
            <div class="topic-card" data-topic="${topic}">
                <div class="topic-card-header">
                    <div class="topic-card-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                        </svg>
                    </div>
                    <span class="topic-card-count">${topicCounts[topic]} pages</span>
                </div>
                <div class="topic-card-title">${topic}</div>
                <div class="topic-card-subtitle">Last saved: ${this.formatDate(topicLatest[topic])}</div>
            </div>
        `).join('');

        // Add click handlers
        this.topicsGrid.querySelectorAll('.topic-card').forEach(card => {
            card.addEventListener('click', () => {
                const topic = card.dataset.topic;
                this.selectTopic(topic);
            });
        });
    }

    selectTopic(topic) {
        this.currentTopic = topic;
        this.showView('notes');
        this.renderNotesList();
        this.updateNotesBreadcrumb();
    }

    // ============================================
    // Notes List Rendering
    // ============================================

    renderNotesList() {
        if (!this.notesList) return;

        // Filter by subject and topic
        let entries = this.allEntries;
        if (this.currentSubject) {
            entries = entries.filter(e => e.subject === this.currentSubject);
        }
        if (this.currentTopic) {
            entries = entries.filter(e => e.topic === this.currentTopic);
        }

        // Sort by timestamp (newest first)
        entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        if (entries.length === 0) {
            this.notesList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-tertiary);">
                    No notes found
                </div>
            `;
            return;
        }

        this.notesList.innerHTML = entries.map(entry => `
            <div class="note-item" data-id="${entry.id}">
                <div class="note-item-header">
                    <span class="note-item-title">${entry.title || 'Untitled'}</span>
                    <span class="note-item-chapter">${entry.chapter}</span>
                </div>
                <div class="note-item-meta">
                    <span class="note-item-url">${this.formatUrl(entry.url)}</span>
                    <span>${this.formatDate(entry.timestamp)}</span>
                </div>
            </div>
        `).join('');

        // Add click handlers
        this.notesList.querySelectorAll('.note-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = parseInt(item.dataset.id);
                this.openDetail(id);
            });
        });
    }

    // ============================================
    // Detail View Rendering
    // ============================================

    async openDetail(id) {
        if (!window.knowledgeDB) return;

        try {
            const entry = await window.knowledgeDB.getKnowledgeById(id);
            if (!entry) return;

            this.currentEntry = entry;
            this.showView('detail');
            this.renderDetailContent(entry);
        } catch (err) {
        }
    }

    renderDetailContent(entry) {
        if (!this.detailContent) return;

        this.detailContent.innerHTML = `
            <h2 class="detail-title">${entry.title || 'Untitled'}</h2>
            <div class="detail-url">
                <a href="${entry.url}" target="_blank">${entry.url}</a>
            </div>
            
            <div class="detail-meta">
                <span class="detail-tag subject">${entry.subject}</span>
                <span class="detail-tag">${entry.topic}</span>
                <span class="detail-tag">${entry.chapter}</span>
                <span class="detail-tag">${this.formatDate(entry.timestamp)}</span>
            </div>

            ${entry.keyPoints && entry.keyPoints.length > 0 ? `
                <div class="detail-section">
                    <div class="detail-section-title">Key Points</div>
                    <div class="detail-keypoints">
                        ${entry.keyPoints.map(kp => `
                            <div class="detail-keypoint">${kp}</div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}

            ${entry.paragraphs && entry.paragraphs.length > 0 ? `
                <div class="detail-section">
                    <div class="detail-section-title">Content Excerpts</div>
                    <div class="detail-paragraphs">
                        ${entry.paragraphs.slice(0, 10).map(p => `
                            <div class="detail-paragraph">${p}</div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        `;
    }

    async deleteCurrentEntry() {
        if (!this.currentEntry || !window.knowledgeDB) return;

        if (!confirm('确定删除此知识条目？')) return;

        try {
            await window.knowledgeDB.deleteKnowledgeEntry(this.currentEntry.id);
            this.currentEntry = null;
            await this.loadData();
            this.navigateBack();
        } catch (err) {
        }
    }

    navigateBack() {
        if (this.currentEntry) {
            this.currentEntry = null;
            this.showView('notes');
            this.renderNotesList();
        } else if (this.currentTopic) {
            this.currentTopic = null;
            this.showView('topics');
            this.renderTopicsGrid();
            this.updateBreadcrumb();
        }
    }

    // ============================================
    // Breadcrumb
    // ============================================

    updateBreadcrumb() {
        if (!this.breadcrumb) return;

        if (this.currentSubject) {
            this.breadcrumb.innerHTML = `
                <span class="breadcrumb-item" data-action="all">All Subjects</span>
                <span class="breadcrumb-separator">›</span>
                <span class="breadcrumb-item active">${this.currentSubject}</span>
            `;
        } else {
            this.breadcrumb.innerHTML = `
                <span class="breadcrumb-item active">All Subjects</span>
            `;
        }

        // Add click handler
        this.breadcrumb.querySelectorAll('.breadcrumb-item[data-action]').forEach(item => {
            item.addEventListener('click', () => {
                this.selectSubject(null);
            });
        });
    }

    updateNotesBreadcrumb() {
        if (!this.notesBreadcrumb) return;

        this.notesBreadcrumb.innerHTML = `
            <span class="breadcrumb-item" data-action="all">All</span>
            <span class="breadcrumb-separator">›</span>
            ${this.currentSubject ? `
                <span class="breadcrumb-item" data-action="subject">${this.currentSubject}</span>
                <span class="breadcrumb-separator">›</span>
            ` : ''}
            <span class="breadcrumb-item active">${this.currentTopic}</span>
        `;

        // Add click handlers
        this.notesBreadcrumb.querySelector('[data-action="all"]')?.addEventListener('click', () => {
            this.currentTopic = null;
            this.currentSubject = null;
            this.showView('topics');
            this.renderSubjectsSidebar();
            this.renderTopicsGrid();
        });

        this.notesBreadcrumb.querySelector('[data-action="subject"]')?.addEventListener('click', () => {
            this.currentTopic = null;
            this.showView('topics');
            this.renderTopicsGrid();
        });
    }

    // ============================================
    // Search
    // ============================================

    async handleSearch(query) {
        if (!query.trim()) {
            // Reset to normal view
            await this.loadData();
            return;
        }

        if (!window.knowledgeDB) return;

        try {
            const results = await window.knowledgeDB.searchKnowledge(query);
            this.allEntries = results;

            this.updateStats();
            this.renderSubjectsSidebar();

            if (results.length === 0) {
                this.showView('topics');
                this.topicsGrid.innerHTML = `
                    <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-tertiary);">
                        <p style="margin-bottom: 8px;">No results found for "${query}"</p>
                        <p style="font-size: 12px;">Try different keywords</p>
                    </div>
                `;
            } else {
                this.showView('topics');
                this.renderTopicsGrid();
            }
        } catch (err) {
        }
    }

    // ============================================
    // Utility Functions
    // ============================================

    formatDate(dateString) {
        if (!dateString) return 'Unknown';
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
    }

    formatUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname + urlObj.pathname.substring(0, 30) + (urlObj.pathname.length > 30 ? '...' : '');
        } catch {
            return url.substring(0, 50);
        }
    }
}

// ============================================
// Knowledge Book Exporter - PDF Generation
// ============================================
class KnowledgeBookExporter {
    constructor() {
        this.pageWidth = 595;  // A4 width in points (72 dpi)
        this.pageHeight = 842; // A4 height in points
        this.margin = 50;
        this.contentWidth = this.pageWidth - (this.margin * 2);
        this.lineHeight = 18;
        this.exportBtn = document.getElementById('knowledgeExportBtn');

        this.init();
    }

    init() {
        if (this.exportBtn) {
            this.exportBtn.addEventListener('click', () => this.exportBook());
        }
    }

    async exportBook() {
        if (!window.knowledgeDB) {
            alert('知识数据库不可用');
            return;
        }

        // Disable button during export
        if (this.exportBtn) {
            this.exportBtn.disabled = true;
            this.exportBtn.innerHTML = '<span>⏳ Generating...</span>';
        }

        try {
            // Fetch all entries
            const entries = await window.knowledgeDB.getAllKnowledge();

            if (entries.length === 0) {
                alert('没有知识条目可导出。请先启用知识模式并浏览一些页面！');
                return;
            }

            // Organize entries by Subject → Topic → Chapter
            const organized = this.organizeEntries(entries);

            // Generate HTML content
            const htmlContent = this.generateBookHTML(organized, entries.length);

            // Create and download PDF
            await this.downloadAsPDF(htmlContent);

        } catch (err) {
            alert('导出失败：' + err.message);
        } finally {
            // Re-enable button
            if (this.exportBtn) {
                this.exportBtn.disabled = false;
                this.exportBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                        <path d="M12 11v6M9 14l3 3 3-3"/>
                    </svg>
                    <span>📘 Export Book</span>
                `;
            }
        }
    }

    organizeEntries(entries) {
        const organized = {};

        entries.forEach(entry => {
            const subject = entry.subject || 'General';
            const topic = entry.topic || 'Miscellaneous';
            const chapter = entry.chapter || 'Notes';

            if (!organized[subject]) {
                organized[subject] = {};
            }
            if (!organized[subject][topic]) {
                organized[subject][topic] = {};
            }
            if (!organized[subject][topic][chapter]) {
                organized[subject][topic][chapter] = [];
            }

            organized[subject][topic][chapter].push(entry);
        });

        return organized;
    }

    generateBookHTML(organized, totalEntries) {
        const date = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        const subjects = Object.keys(organized).sort();

        // Build Table of Contents
        let tocHTML = '';
        let pageNum = 3; // Start after title and TOC
        const tocEntries = [];

        subjects.forEach(subject => {
            tocEntries.push({ type: 'subject', name: subject, page: pageNum });
            const topics = Object.keys(organized[subject]).sort();

            topics.forEach(topic => {
                tocEntries.push({ type: 'topic', name: topic, page: pageNum });
                const chapters = Object.keys(organized[subject][topic]).sort();

                chapters.forEach(chapter => {
                    const entries = organized[subject][topic][chapter];
                    tocEntries.push({ type: 'chapter', name: chapter, count: entries.length, page: pageNum });
                    pageNum += Math.ceil(entries.length / 3); // Rough estimate
                });
            });
        });

        tocHTML = tocEntries.map(entry => {
            if (entry.type === 'subject') {
                return `<div class="toc-subject">${entry.name}</div>`;
            } else if (entry.type === 'topic') {
                return `<div class="toc-topic">↳ ${entry.name}</div>`;
            } else {
                return `<div class="toc-chapter">   • ${entry.name} (${entry.count} notes)</div>`;
            }
        }).join('');

        // Build Content Sections
        let contentHTML = '';

        subjects.forEach(subject => {
            contentHTML += `
                <div class="page-break"></div>
                <div class="subject-header">
                    <h1>${subject}</h1>
                </div>
            `;

            const topics = Object.keys(organized[subject]).sort();

            topics.forEach(topic => {
                contentHTML += `
                    <div class="topic-section">
                        <h2>${topic}</h2>
                    </div>
                `;

                const chapters = Object.keys(organized[subject][topic]).sort();

                chapters.forEach(chapter => {
                    const entries = organized[subject][topic][chapter];

                    contentHTML += `
                        <div class="chapter-section">
                            <h3>${chapter}</h3>
                            <div class="chapter-notes">
                    `;

                    entries.forEach(entry => {
                        const keyPoints = (entry.keyPoints || []).slice(0, 5);
                        const excerpts = (entry.paragraphs || []).slice(0, 2);

                        contentHTML += `
                            <div class="note-card">
                                <div class="note-title">${this.escapeHTML(entry.title || 'Untitled')}</div>
                                <div class="note-url">${this.escapeHTML(entry.url)}</div>
                                ${keyPoints.length > 0 ? `
                                    <div class="note-keypoints">
                                        <strong>Key Points:</strong>
                                        <ul>
                                            ${keyPoints.map(kp => `<li>${this.escapeHTML(kp)}</li>`).join('')}
                                        </ul>
                                    </div>
                                ` : ''}
                                ${excerpts.length > 0 ? `
                                    <div class="note-excerpts">
                                        ${excerpts.map(p => `<p>${this.escapeHTML(p.substring(0, 200))}${p.length > 200 ? '...' : ''}</p>`).join('')}
                                    </div>
                                ` : ''}
                                <div class="note-date">Saved: ${new Date(entry.timestamp).toLocaleDateString()}</div>
                            </div>
                        `;
                    });

                    contentHTML += `
                            </div>
                        </div>
                    `;
                });
            });
        });

        // Complete HTML Document
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>My Knowledge Book</title>
    <style>
        @page {
            size: A4;
            margin: 20mm;
        }
        
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            font-size: 11pt;
            line-height: 1.6;
            color: #333;
            background: white;
        }
        
        .page-break {
            page-break-before: always;
        }
        
        /* Title Page */
        .title-page {
            height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            page-break-after: always;
        }
        
        .title-page h1 {
            font-size: 42pt;
            color: #1a73e8;
            margin-bottom: 20px;
            font-weight: 300;
        }
        
        .title-page .subtitle {
            font-size: 16pt;
            color: #666;
            margin-bottom: 40px;
        }
        
        .title-page .book-icon {
            font-size: 80pt;
            margin-bottom: 40px;
        }
        
        .title-page .meta {
            font-size: 12pt;
            color: #888;
        }
        
        .title-page .stats {
            margin-top: 60px;
            padding: 20px 40px;
            background: #f5f5f5;
            border-radius: 8px;
        }
        
        .title-page .stats div {
            margin: 8px 0;
        }
        
        /* Table of Contents */
        .toc-page {
            page-break-after: always;
        }
        
        .toc-page h2 {
            font-size: 24pt;
            color: #1a73e8;
            margin-bottom: 30px;
            border-bottom: 2px solid #1a73e8;
            padding-bottom: 10px;
        }
        
        .toc-subject {
            font-size: 14pt;
            font-weight: 600;
            color: #1a73e8;
            margin: 20px 0 8px 0;
        }
        
        .toc-topic {
            font-size: 12pt;
            color: #444;
            margin: 6px 0 6px 20px;
        }
        
        .toc-chapter {
            font-size: 11pt;
            color: #666;
            margin: 4px 0 4px 40px;
        }
        
        /* Content Sections */
        .subject-header {
            margin-bottom: 30px;
        }
        
        .subject-header h1 {
            font-size: 28pt;
            color: #1a73e8;
            border-bottom: 3px solid #1a73e8;
            padding-bottom: 15px;
            margin-bottom: 20px;
        }
        
        .topic-section h2 {
            font-size: 18pt;
            color: #333;
            background: #f0f7ff;
            padding: 12px 16px;
            margin: 25px 0 15px 0;
            border-left: 4px solid #1a73e8;
        }
        
        .chapter-section h3 {
            font-size: 14pt;
            color: #555;
            margin: 20px 0 12px 0;
            padding-bottom: 8px;
            border-bottom: 1px solid #ddd;
        }
        
        .note-card {
            background: #fafafa;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            padding: 16px;
            margin: 12px 0;
            page-break-inside: avoid;
        }
        
        .note-title {
            font-size: 12pt;
            font-weight: 600;
            color: #222;
            margin-bottom: 6px;
        }
        
        .note-url {
            font-size: 9pt;
            color: #1a73e8;
            margin-bottom: 12px;
            word-break: break-all;
        }
        
        .note-keypoints {
            margin: 10px 0;
        }
        
        .note-keypoints strong {
            font-size: 10pt;
            color: #444;
        }
        
        .note-keypoints ul {
            margin: 8px 0 0 20px;
        }
        
        .note-keypoints li {
            font-size: 10pt;
            color: #555;
            margin: 4px 0;
        }
        
        .note-excerpts {
            margin: 12px 0;
            padding: 10px;
            background: white;
            border-left: 3px solid #1a73e8;
        }
        
        .note-excerpts p {
            font-size: 10pt;
            color: #555;
            margin: 8px 0;
            font-style: italic;
        }
        
        .note-date {
            font-size: 9pt;
            color: #999;
            text-align: right;
            margin-top: 10px;
        }
        
        /* Footer */
        .page-footer {
            position: fixed;
            bottom: 10mm;
            left: 0;
            right: 0;
            text-align: center;
            font-size: 9pt;
            color: #aaa;
        }
    </style>
</head>
<body>
    <!-- Title Page -->
    <div class="title-page">
        <div class="book-icon">📚</div>
        <h1>My Knowledge Book</h1>
        <div class="subtitle">A Personal Collection of Learning & Insights</div>
        <div class="meta">Generated by Flowmora Browser</div>
        <div class="meta">${date}</div>
        <div class="stats">
            <div><strong>${totalEntries}</strong> pages collected</div>
            <div><strong>${subjects.length}</strong> subjects covered</div>
            <div><strong>${Object.values(organized).reduce((acc, subj) => acc + Object.keys(subj).length, 0)}</strong> topics explored</div>
        </div>
    </div>
    
    <!-- Table of Contents -->
    <div class="toc-page">
        <h2>📑 Table of Contents</h2>
        ${tocHTML}
    </div>
    
    <!-- Content -->
    ${contentHTML}
    
</body>
</html>
        `;
    }

    escapeHTML(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    async downloadAsPDF(htmlContent) {
        // Create a new window for printing
        const printWindow = window.open('', '_blank', 'width=800,height=600');

        if (!printWindow) {
            // Fallback: download as HTML
            this.downloadAsHTML(htmlContent);
            return;
        }

        printWindow.document.write(htmlContent);
        printWindow.document.close();

        // Wait for content to load, then trigger print
        printWindow.onload = () => {
            setTimeout(() => {
                printWindow.print();
                // Close after a delay to allow print dialog
                setTimeout(() => {
                    printWindow.close();
                }, 1000);
            }, 500);
        };
    }

    downloadAsHTML(htmlContent) {
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'My Knowledge Book.html';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        alert('在此上下文中无法导出 PDF。已下载 HTML 文件，您可以打开它并打印为 PDF。');
    }
}

// ============================================
// Time Display
// ============================================
function updateTimeDisplay() {
    const timeEl = document.getElementById('timeDisplay');
    if (timeEl) {
        const now = new Date();
        const options = {
            weekday: 'long',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        };
        timeEl.textContent = now.toLocaleDateString('en-US', options);
    }
}

// ============================================
// Bookmark Manager Class
// ============================================
class BookmarkManager {
    constructor(tabManager) {
        this.tabManager = tabManager;
        this.bookmarks = [];
        this.folders = [];
        this.storageKey = 'focusflow-bookmarks';
        this.foldersKey = 'focusflow-bookmark-folders';

        // DOM Elements
        this.bookmarkBtn = document.getElementById('bookmarkBtn');
        this.bookmarksContainer = document.getElementById('bookmarksContainer');
        this.allBookmarksBtn = document.getElementById('allBookmarksBtn');

        this.init();
    }

    init() {
        this.loadBookmarks();
        this.loadFolders();
        this.renderBookmarksBar();
        this.setupEventListeners();
    }

    // ============================================
    // Storage Operations
    // ============================================

    loadBookmarks() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            this.bookmarks = stored ? JSON.parse(stored) : this.getDefaultBookmarks();
        } catch (e) {
            this.bookmarks = this.getDefaultBookmarks();
        }
    }

    loadFolders() {
        try {
            const stored = localStorage.getItem(this.foldersKey);
            this.folders = stored ? JSON.parse(stored) : [];
        } catch (e) {
            this.folders = [];
        }
    }

    saveBookmarks() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.bookmarks));
        } catch (e) {
        }
    }

    saveFolders() {
        try {
            localStorage.setItem(this.foldersKey, JSON.stringify(this.folders));
        } catch (e) {
        }
    }

    getDefaultBookmarks() {
        return [
            { id: 1, title: '百度', url: 'https://www.baidu.com', favicon: null, folderId: null },
            { id: 2, title: '淘宝', url: 'https://www.taobao.com', favicon: null, folderId: null },
            { id: 3, title: '京东', url: 'https://www.jd.com', favicon: null, folderId: null },
            { id: 4, title: 'B站', url: 'https://www.bilibili.com', favicon: null, folderId: null },
            { id: 5, title: '知乎', url: 'https://www.zhihu.com', favicon: null, folderId: null },
            { id: 6, title: '微博', url: 'https://www.weibo.com', favicon: null, folderId: null },
            { id: 7, title: '网易云音乐', url: 'https://music.163.com', favicon: null, folderId: null },
            { id: 8, title: '腾讯视频', url: 'https://v.qq.com', favicon: null, folderId: null },
            { id: 9, title: '爱奇艺', url: 'https://www.iqiyi.com', favicon: null, folderId: null },
            { id: 10, title: '百度网盘', url: 'https://pan.baidu.com', favicon: null, folderId: null },
            { id: 11, title: 'GitHub', url: 'https://github.com', favicon: null, folderId: null },
        ];
    }

    // ============================================
    // Bookmark Operations
    // ============================================

    addBookmark(url, title, favicon = null, folderId = null) {
        // Check if already bookmarked
        if (this.isBookmarked(url)) {
            return false;
        }

        const bookmark = {
            id: Date.now(),
            title: title || this.getTitleFromUrl(url),
            url: url,
            favicon: favicon,
            folderId: folderId,
            createdAt: new Date().toISOString()
        };

        this.bookmarks.push(bookmark);
        this.saveBookmarks();
        this.renderBookmarksBar();
        return true;
    }

    removeBookmark(url) {
        const index = this.bookmarks.findIndex(b => b.url === url);
        if (index !== -1) {
            this.bookmarks.splice(index, 1);
            this.saveBookmarks();
            this.renderBookmarksBar();
            return true;
        }
        return false;
    }

    removeBookmarkById(id) {
        const index = this.bookmarks.findIndex(b => b.id === id);
        if (index !== -1) {
            this.bookmarks.splice(index, 1);
            this.saveBookmarks();
            this.renderBookmarksBar();
            return true;
        }
        return false;
    }

    isBookmarked(url) {
        return this.bookmarks.some(b => b.url === url);
    }

    getBookmark(url) {
        return this.bookmarks.find(b => b.url === url);
    }

    getTitleFromUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.replace('www.', '');
        } catch {
            return url;
        }
    }

    // ============================================
    // Folder Operations
    // ============================================

    createFolder(name) {
        const folder = {
            id: Date.now(),
            name: name,
            createdAt: new Date().toISOString()
        };
        this.folders.push(folder);
        this.saveFolders();
        this.renderBookmarksBar();
        return folder;
    }

    deleteFolder(folderId) {
        // Move bookmarks out of folder
        this.bookmarks.forEach(b => {
            if (b.folderId === folderId) {
                b.folderId = null;
            }
        });
        this.saveBookmarks();

        // Remove folder
        const index = this.folders.findIndex(f => f.id === folderId);
        if (index !== -1) {
            this.folders.splice(index, 1);
            this.saveFolders();
        }
        this.renderBookmarksBar();
    }

    getBookmarksInFolder(folderId) {
        return this.bookmarks.filter(b => b.folderId === folderId);
    }

    getUnfiledBookmarks() {
        return this.bookmarks.filter(b => !b.folderId);
    }

    // ============================================
    // UI Rendering
    // ============================================

    renderBookmarksBar() {
        if (!this.bookmarksContainer) return;

        this.bookmarksContainer.innerHTML = '';

        // Render folders first
        this.folders.forEach(folder => {
            const folderEl = this.createFolderElement(folder);
            this.bookmarksContainer.appendChild(folderEl);
        });

        // Render unfiled bookmarks
        const unfiledBookmarks = this.getUnfiledBookmarks();
        unfiledBookmarks.slice(0, 10).forEach(bookmark => {
            const bookmarkEl = this.createBookmarkElement(bookmark);
            this.bookmarksContainer.appendChild(bookmarkEl);
        });

        // Update star button state
        this.updateStarButton();
    }

    createBookmarkElement(bookmark) {
        const el = document.createElement('a');
        el.className = 'bookmark-item';
        el.href = '#';
        el.dataset.bookmarkId = bookmark.id;
        el.title = `${bookmark.title}\n${bookmark.url}`;

        const faviconHtml = bookmark.favicon
            ? `<img src="${bookmark.favicon}" alt="" onerror="this.style.display='none'"/>`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
               </svg>`;

        el.innerHTML = `
            <span class="bookmark-favicon">${faviconHtml}</span>
            <span class="bookmark-title">${bookmark.title}</span>
        `;

        // Click to open
        el.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.tabManager.navigate(bookmark.url);
        });


        // Middle-click to open in new tab
        el.addEventListener('auxclick', (e) => {
            if (e.button === 1) {
                e.preventDefault();
                this.tabManager.createTab(bookmark.url);
            }
        });

        // Right-click context menu
        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showBookmarkContextMenu(e, bookmark);
        });

        return el;
    }

    createFolderElement(folder) {
        const el = document.createElement('div');
        el.className = 'bookmark-folder';
        el.dataset.folderId = folder.id;

        el.innerHTML = `
            <svg class="folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            <span class="folder-name">${folder.name}</span>
            <svg class="folder-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"/>
            </svg>
        `;

        // Click to toggle dropdown
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleFolderDropdown(el, folder);
        });

        // Right-click to delete
        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showFolderContextMenu(e, folder);
        });

        return el;
    }

    toggleFolderDropdown(folderEl, folder) {
        // Close any existing dropdowns
        document.querySelectorAll('.folder-dropdown').forEach(d => d.remove());

        const dropdown = document.createElement('div');
        dropdown.className = 'folder-dropdown';

        const bookmarks = this.getBookmarksInFolder(folder.id);

        if (bookmarks.length === 0) {
            dropdown.innerHTML = '<div class="folder-empty">No bookmarks</div>';
        } else {
            bookmarks.forEach(bookmark => {
                const item = document.createElement('a');
                item.className = 'folder-dropdown-item';
                item.href = '#';
                item.innerHTML = `
                    <span class="bookmark-favicon">
                        ${bookmark.favicon ? `<img src="${bookmark.favicon}" alt=""/>` : '🌐'}
                    </span>
                    <span>${bookmark.title}</span>
                `;
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.tabManager.navigate(bookmark.url);
                    dropdown.remove();
                });
                dropdown.appendChild(item);
            });
        }

        // Position dropdown
        const rect = folderEl.getBoundingClientRect();
        dropdown.style.top = `${rect.bottom + 4}px`;
        dropdown.style.left = `${rect.left}px`;

        document.body.appendChild(dropdown);

        // Close on click outside
        const closeDropdown = (e) => {
            if (!dropdown.contains(e.target) && !folderEl.contains(e.target)) {
                dropdown.remove();
                document.removeEventListener('click', closeDropdown);
            }
        };
        setTimeout(() => document.addEventListener('click', closeDropdown), 0);
    }

    showBookmarkContextMenu(e, bookmark) {
        this.closeContextMenus();

        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.innerHTML = `
            <div class="context-menu-item" data-action="open-new-tab">在新标签页中打开</div>
            <div class="context-menu-item" data-action="edit">编辑</div>
            <div class="context-menu-divider"></div>
            <div class="context-menu-item danger" data-action="delete">删除</div>
        `;

        menu.style.top = `${e.clientY}px`;
        menu.style.left = `${e.clientX}px`;

        menu.addEventListener('click', (evt) => {
            const action = evt.target.dataset.action;
            if (action === 'open-new-tab') {
                this.tabManager.createTab(bookmark.url);
            } else if (action === 'delete') {
                this.removeBookmarkById(bookmark.id);
            } else if (action === 'edit') {
                this.editBookmark(bookmark);
            }
            menu.remove();
        });

        document.body.appendChild(menu);
        this.setupContextMenuClose(menu);
    }

    showFolderContextMenu(e, folder) {
        this.closeContextMenus();

        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.innerHTML = `
            <div class="context-menu-item" data-action="rename">重命名</div>
            <div class="context-menu-divider"></div>
            <div class="context-menu-item danger" data-action="delete">删除文件夹</div>
        `;

        menu.style.top = `${e.clientY}px`;
        menu.style.left = `${e.clientX}px`;

        menu.addEventListener('click', (evt) => {
            const action = evt.target.dataset.action;
            if (action === 'delete') {
                this.deleteFolder(folder.id);
            } else if (action === 'rename') {
                const newName = prompt('文件夹名称：', folder.name);
                if (newName) {
                    folder.name = newName;
                    this.saveFolders();
                    this.renderBookmarksBar();
                }
            }
            menu.remove();
        });

        document.body.appendChild(menu);
        this.setupContextMenuClose(menu);
    }

    closeContextMenus() {
        document.querySelectorAll('.context-menu, .folder-dropdown').forEach(m => m.remove());
    }

    setupContextMenuClose(menu) {
        const close = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', close);
            }
        };
        setTimeout(() => document.addEventListener('click', close), 0);
    }

    editBookmark(bookmark) {
        const newTitle = prompt('书签标题：', bookmark.title);
        if (newTitle !== null) {
            bookmark.title = newTitle || bookmark.title;
            this.saveBookmarks();
            this.renderBookmarksBar();
        }
    }

    // ============================================
    // Star Button Management
    // ============================================

    updateStarButton() {
        if (!this.bookmarkBtn) return;

        // Check if tabManager and tabs exist
        if (!this.tabManager || !this.tabManager.tabs) {
            this.bookmarkBtn.classList.remove('bookmarked');
            return;
        }

        const tab = this.tabManager.tabs.get(this.tabManager.activeTabId);
        if (tab && tab.url && tab.url !== 'about:blank') {
            const isBookmarked = this.isBookmarked(tab.url);
            this.bookmarkBtn.classList.toggle('bookmarked', isBookmarked);
        } else {
            this.bookmarkBtn.classList.remove('bookmarked');
        }
    }

    toggleCurrentPage() {
        const tab = this.tabManager.tabs.get(this.tabManager.activeTabId);
        if (!tab || !tab.url || tab.url === 'about:blank') {
            return;
        }

        if (this.isBookmarked(tab.url)) {
            this.removeBookmark(tab.url);
        } else {
            this.addBookmark(tab.url, tab.title, tab.favicon);
        }
        this.updateStarButton();
    }


    // ============================================
    // Event Listeners
    // ============================================

    setupEventListeners() {
        // Star button click
        if (this.bookmarkBtn) {
            this.bookmarkBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleCurrentPage();
            });
        } else {
        }

        // All bookmarks button
        if (this.allBookmarksBtn) {
            this.allBookmarksBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showAllBookmarksMenu(e);
            });
        } else {
        }

        // Close menus on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeContextMenus();
            }
        });
    }


    showAllBookmarksMenu(e) {
        this.closeContextMenus();

        const menu = document.createElement('div');
        menu.className = 'context-menu all-bookmarks-menu';

        // Add folder option
        const addFolderItem = document.createElement('div');
        addFolderItem.className = 'context-menu-item';
        addFolderItem.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;margin-right:8px;">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                <line x1="12" y1="11" x2="12" y2="17"/>
                <line x1="9" y1="14" x2="15" y2="14"/>
            </svg>
            新建文件夹
        `;
        addFolderItem.addEventListener('click', () => {
            const name = prompt('文件夹名称：');
            if (name) {
                this.createFolder(name);
            }
            menu.remove();
        });
        menu.appendChild(addFolderItem);

        menu.appendChild(this.createMenuDivider());

        // All bookmarks list
        if (this.bookmarks.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'context-menu-item disabled';
            empty.textContent = 'No bookmarks yet';
            menu.appendChild(empty);
        } else {
            this.bookmarks.slice(0, 15).forEach(bookmark => {
                const item = document.createElement('div');
                item.className = 'context-menu-item';
                item.innerHTML = `
                    <span class="bookmark-favicon" style="margin-right:8px;">
                        ${bookmark.favicon ? `<img src="${bookmark.favicon}" style="width:14px;height:14px;"/>` : '🌐'}
                    </span>
                    ${bookmark.title}
                `;
                item.addEventListener('click', () => {
                    this.tabManager.navigate(bookmark.url);
                    menu.remove();
                });
                menu.appendChild(item);
            });
        }

        const rect = this.allBookmarksBtn.getBoundingClientRect();
        menu.style.top = `${rect.bottom + 4}px`;
        menu.style.right = `${window.innerWidth - rect.right}px`;

        document.body.appendChild(menu);
        this.setupContextMenuClose(menu);
    }

    createMenuDivider() {
        const divider = document.createElement('div');
        divider.className = 'context-menu-divider';
        return divider;
    }
}

// ============================================
// History Manager Class
// ============================================
class HistoryManager {
    constructor(tabManager) {
        this.tabManager = tabManager;
        this.history = [];
        this.recentlyClosed = [];
        this.storageKey = 'focusflow-history';
        this.closedTabsKey = 'focusflow-closed-tabs';
        this.maxHistoryItems = 1000;
        this.maxClosedTabs = 25;
        this.isPanelOpen = false;

        this.init();
    }

    init() {
        this.loadHistory();
        this.loadClosedTabs();
        this.createHistoryPanel();
        this.setupEventListeners();
    }

    // ============================================
    // Storage Operations
    // ============================================

    loadHistory() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            this.history = stored ? JSON.parse(stored) : [];
        } catch (e) {
            this.history = [];
        }
    }

    saveHistory() {
        try {
            // Limit history size
            if (this.history.length > this.maxHistoryItems) {
                this.history = this.history.slice(0, this.maxHistoryItems);
            }
            localStorage.setItem(this.storageKey, JSON.stringify(this.history));
        } catch (e) {
        }
    }

    loadClosedTabs() {
        try {
            const stored = localStorage.getItem(this.closedTabsKey);
            this.recentlyClosed = stored ? JSON.parse(stored) : [];
        } catch (e) {
            this.recentlyClosed = [];
        }
    }

    saveClosedTabs() {
        try {
            if (this.recentlyClosed.length > this.maxClosedTabs) {
                this.recentlyClosed = this.recentlyClosed.slice(0, this.maxClosedTabs);
            }
            localStorage.setItem(this.closedTabsKey, JSON.stringify(this.recentlyClosed));
        } catch (e) {
        }
    }

    // ============================================
    // History Operations
    // ============================================

    addToHistory(url, title, favicon = null) {
        if (!url || url === 'about:blank') return;

        // Don't add duplicates for the same URL visited consecutively
        if (this.history.length > 0 && this.history[0].url === url) {
            // Update timestamp and title if changed
            this.history[0].timestamp = Date.now();
            this.history[0].title = title || this.history[0].title;
            this.saveHistory();
            return;
        }

        const entry = {
            id: Date.now(),
            url: url,
            title: title || this.getTitleFromUrl(url),
            favicon: favicon,
            timestamp: Date.now()
        };

        this.history.unshift(entry);
        this.saveHistory();
    }

    removeFromHistory(id) {
        const index = this.history.findIndex(h => h.id === id);
        if (index !== -1) {
            this.history.splice(index, 1);
            this.saveHistory();
            this.renderHistoryPanel();
        }
    }

    clearHistory() {
        this.history = [];
        this.saveHistory();
        this.renderHistoryPanel();
    }

    clearClosedTabs() {
        this.recentlyClosed = [];
        this.saveClosedTabs();
        this.renderHistoryPanel();
    }

    getTitleFromUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.replace('www.', '');
        } catch {
            return url;
        }
    }

    // ============================================
    // Recently Closed Tabs
    // ============================================

    addClosedTab(url, title, favicon = null) {
        if (!url || url === 'about:blank') return;

        const entry = {
            id: Date.now(),
            url: url,
            title: title || this.getTitleFromUrl(url),
            favicon: favicon,
            closedAt: Date.now()
        };

        this.recentlyClosed.unshift(entry);
        this.saveClosedTabs();
    }

    restoreClosedTab(id) {
        const index = this.recentlyClosed.findIndex(t => t.id === id);
        if (index !== -1) {
            const tab = this.recentlyClosed[index];
            this.recentlyClosed.splice(index, 1);
            this.saveClosedTabs();
            this.tabManager.createTab(tab.url);
            this.renderHistoryPanel();
        }
    }

    restoreLastClosedTab() {
        if (this.recentlyClosed.length > 0) {
            this.restoreClosedTab(this.recentlyClosed[0].id);
        }
    }

    // ============================================
    // History Panel UI
    // ============================================

    createHistoryPanel() {
        // Create panel element
        const panel = document.createElement('div');
        panel.id = 'historyPanel';
        panel.className = 'history-panel';
        panel.innerHTML = `
            <div class="history-panel-header">
                <h3>History</h3>
                <button class="history-panel-close" id="historyPanelClose">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                </button>
            </div>
            <div class="history-panel-tabs">
                <button class="history-tab active" data-tab="history">History</button>
                <button class="history-tab" data-tab="closed">Recently Closed</button>
            </div>
            <div class="history-panel-actions">
                <button class="history-action-btn" id="clearHistoryBtn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                    Clear All
                </button>
            </div>
            <div class="history-panel-content" id="historyPanelContent">
                <!-- Content rendered dynamically -->
            </div>
        `;

        document.body.appendChild(panel);

        // Tab switching
        panel.querySelectorAll('.history-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                panel.querySelectorAll('.history-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.renderHistoryPanel();
            });
        });

        // Close button
        panel.querySelector('#historyPanelClose').addEventListener('click', () => {
            this.togglePanel(false);
        });

        // Clear button
        panel.querySelector('#clearHistoryBtn').addEventListener('click', () => {
            const activeTab = panel.querySelector('.history-tab.active').dataset.tab;
            if (activeTab === 'history') {
                if (confirm('确定清除所有浏览历史？')) {
                    this.clearHistory();
                }
            } else {
                if (confirm('确定清除所有最近关闭的标签页？')) {
                    this.clearClosedTabs();
                }
            }
        });
    }

    renderHistoryPanel() {
        const panel = document.getElementById('historyPanel');
        if (!panel) return;

        const content = panel.querySelector('#historyPanelContent');
        const activeTab = panel.querySelector('.history-tab.active').dataset.tab;

        content.innerHTML = '';

        if (activeTab === 'history') {
            this.renderHistoryList(content);
        } else {
            this.renderClosedTabsList(content);
        }
    }

    renderHistoryList(container) {
        if (this.history.length === 0) {
            container.innerHTML = `
                <div class="history-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <p>No browsing history</p>
                </div>
            `;
            return;
        }

        // Group history by date
        const grouped = this.groupByDate(this.history);

        Object.entries(grouped).forEach(([date, items]) => {
            const section = document.createElement('div');
            section.className = 'history-section';

            const header = document.createElement('div');
            header.className = 'history-section-header';
            header.textContent = date;
            section.appendChild(header);

            items.forEach(item => {
                const entry = this.createHistoryEntry(item);
                section.appendChild(entry);
            });

            container.appendChild(section);
        });
    }

    renderClosedTabsList(container) {
        if (this.recentlyClosed.length === 0) {
            container.innerHTML = `
                <div class="history-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <line x1="9" y1="9" x2="15" y2="15"/>
                        <line x1="15" y1="9" x2="9" y2="15"/>
                    </svg>
                    <p>No recently closed tabs</p>
                </div>
            `;
            return;
        }

        this.recentlyClosed.forEach(item => {
            const entry = this.createClosedTabEntry(item);
            container.appendChild(entry);
        });
    }

    createHistoryEntry(item) {
        const entry = document.createElement('div');
        entry.className = 'history-entry';

        const time = new Date(item.timestamp).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });

        entry.innerHTML = `
            <span class="history-entry-favicon">
                ${item.favicon ? `<img src="${item.favicon}" alt=""/>` : '🌐'}
            </span>
            <div class="history-entry-info">
                <span class="history-entry-title">${item.title}</span>
                <span class="history-entry-url">${item.url}</span>
            </div>
            <span class="history-entry-time">${time}</span>
            <button class="history-entry-delete" title="Remove">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
            </button>
        `;

        // Click to navigate
        entry.addEventListener('click', (e) => {
            if (!e.target.closest('.history-entry-delete')) {
                this.tabManager.navigate(item.url);
                this.togglePanel(false);
            }
        });

        // Delete button
        entry.querySelector('.history-entry-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeFromHistory(item.id);
        });

        return entry;
    }

    createClosedTabEntry(item) {
        const entry = document.createElement('div');
        entry.className = 'history-entry closed-tab-entry';

        const time = this.getRelativeTime(item.closedAt);

        entry.innerHTML = `
            <span class="history-entry-favicon">
                ${item.favicon ? `<img src="${item.favicon}" alt=""/>` : '🌐'}
            </span>
            <div class="history-entry-info">
                <span class="history-entry-title">${item.title}</span>
                <span class="history-entry-url">${item.url}</span>
            </div>
            <span class="history-entry-time">${time}</span>
            <button class="history-entry-restore" title="Restore Tab">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="1 4 1 10 7 10"/>
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                </svg>
            </button>
        `;

        // Click to restore
        entry.addEventListener('click', (e) => {
            if (!e.target.closest('.history-entry-restore')) {
                this.restoreClosedTab(item.id);
                this.togglePanel(false);
            }
        });

        // Restore button
        entry.querySelector('.history-entry-restore').addEventListener('click', (e) => {
            e.stopPropagation();
            this.restoreClosedTab(item.id);
        });

        return entry;
    }

    groupByDate(items) {
        const groups = {};
        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();

        items.forEach(item => {
            const date = new Date(item.timestamp).toDateString();
            let label;

            if (date === today) {
                label = 'Today';
            } else if (date === yesterday) {
                label = 'Yesterday';
            } else {
                label = new Date(item.timestamp).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric'
                });
            }

            if (!groups[label]) {
                groups[label] = [];
            }
            groups[label].push(item);
        });

        return groups;
    }

    getRelativeTime(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);

        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    }

    togglePanel(show = null) {
        const panel = document.getElementById('historyPanel');
        if (!panel) return;

        if (show === null) {
            show = !this.isPanelOpen;
        }

        this.isPanelOpen = show;
        panel.classList.toggle('open', show);

        if (show) {
            this.renderHistoryPanel();
        }
    }

    // ============================================
    // Event Listeners
    // ============================================

    setupEventListeners() {
        // Note: Menu button is now handled by MainMenuManager
        // History is accessed via menu or Ctrl+H

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl+H: Toggle history
            if (e.ctrlKey && e.key === 'h') {
                e.preventDefault();
                this.togglePanel();
            }
            // Ctrl+Shift+T: Restore last closed tab
            if (e.ctrlKey && e.shiftKey && e.key === 'T') {
                e.preventDefault();
                this.restoreLastClosedTab();
            }
            // Escape: Close panel
            if (e.key === 'Escape' && this.isPanelOpen) {
                this.togglePanel(false);
            }
        });

        // Close panel on outside click
        document.addEventListener('click', (e) => {
            const panel = document.getElementById('historyPanel');
            const menuBtn = document.getElementById('menuBtn');
            if (this.isPanelOpen && panel && !panel.contains(e.target) && !menuBtn?.contains(e.target)) {
                this.togglePanel(false);
            }
        });
    }
}

// ============================================
// Download Manager Class
// ============================================
class DownloadManager {
    constructor() {
        this.downloads = new Map();
        this.isPanelOpen = false;
        this.notificationTimeout = null;
        this.ipcListenersSetUp = false;

        this.init();
    }

    init() {
        this.createDownloadPanel();
        this.createNotificationPopup();
        this.setupEventListeners();
        if (!this.ipcListenersSetUp) {
            this.setupIPCListeners();
            this.ipcListenersSetUp = true;
        }
    }

    // ============================================
    // IPC Event Listeners
    // ============================================

    setupIPCListeners() {
        if (!window.focusFlowAPI || !window.focusFlowAPI.downloads) {
            return;
        }

        // Listen for download events from main process
        window.focusFlowAPI.downloads.onStarted((data) => {
            this.addDownload(data);
            this.showNotification(`Download started: ${data.filename}`);
        });

        window.focusFlowAPI.downloads.onProgress((data) => {
            this.updateDownloadProgress(data);
        });

        window.focusFlowAPI.downloads.onCompleted((data) => {
            this.completeDownload(data);
            if (data.state === 'completed') {
                this.showNotification(`Download completed: ${data.filename}`, 'success');
            } else {
                this.showNotification(`Download failed: ${data.filename}`, 'error');
            }
        });
    }

    // ============================================
    // Download Operations
    // ============================================

    addDownload(data) {
        // Check if download with the same filename and URL already exists
        const existingDownload = Array.from(this.downloads.values()).find(
            download => download.filename === data.filename && download.url === data.url
        );
        if (existingDownload) {
            return;
        }
        this.downloads.set(data.id, {
            id: data.id,
            filename: data.filename,
            url: data.url,
            totalBytes: data.totalBytes,
            receivedBytes: 0,
            state: 'progressing',
            savePath: null,
            startTime: Date.now()
        });
        this.renderDownloadPanel();
    }

    updateDownloadProgress(data) {
        const download = this.downloads.get(data.id);
        if (download) {
            download.receivedBytes = data.receivedBytes;
            download.totalBytes = data.totalBytes;
            download.state = data.state;
            download.savePath = data.savePath;
            this.renderDownloadPanel();
        }
    }

    completeDownload(data) {
        const download = this.downloads.get(data.id);
        if (download) {
            download.state = data.state;
            download.savePath = data.savePath;
            download.endTime = Date.now();
            this.renderDownloadPanel();
        }
    }

    async pauseDownload(id) {
        if (window.focusFlowAPI?.downloads) {
            await window.focusFlowAPI.downloads.pause(id);
            const download = this.downloads.get(id);
            if (download) {
                download.state = 'paused';
                this.renderDownloadPanel();
            }
        }
    }

    async resumeDownload(id) {
        if (window.focusFlowAPI?.downloads) {
            await window.focusFlowAPI.downloads.resume(id);
            const download = this.downloads.get(id);
            if (download) {
                download.state = 'progressing';
                this.renderDownloadPanel();
            }
        }
    }

    async cancelDownload(id) {
        if (window.focusFlowAPI?.downloads) {
            await window.focusFlowAPI.downloads.cancel(id);
            this.downloads.delete(id);
            this.renderDownloadPanel();
        }
    }

    async openDownload(savePath) {
        if (window.focusFlowAPI?.downloads && savePath) {
            await window.focusFlowAPI.downloads.open(savePath);
        }
    }

    async showInFolder(savePath) {
        if (window.focusFlowAPI?.downloads && savePath) {
            await window.focusFlowAPI.downloads.showInFolder(savePath);
        }
    }

    async clearCompleted() {
        if (window.focusFlowAPI?.downloads) {
            await window.focusFlowAPI.downloads.clearCompleted();
            this.downloads.forEach((download, id) => {
                if (download.state === 'completed' || download.state === 'cancelled' || download.state === 'interrupted') {
                    this.downloads.delete(id);
                }
            });
            this.renderDownloadPanel();
        }
    }

    // ============================================
    // UI Components
    // ============================================

    createDownloadPanel() {
        const panel = document.createElement('div');
        panel.id = 'downloadPanel';
        panel.className = 'download-panel';
        panel.innerHTML = `
            <div class="download-panel-header">
                <h3>Downloads</h3>
                <div class="download-panel-actions">
                    <button class="download-clear-btn" id="clearDownloadsBtn" title="Clear completed">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                    <button class="download-panel-close" id="downloadPanelClose">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="download-panel-content" id="downloadPanelContent">
                <div class="download-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    <p>No downloads</p>
                </div>
            </div>
        `;

        document.body.appendChild(panel);

        // Close button
        panel.querySelector('#downloadPanelClose').addEventListener('click', () => {
            this.togglePanel(false);
        });

        // Clear button
        panel.querySelector('#clearDownloadsBtn').addEventListener('click', () => {
            this.clearCompleted();
        });
    }

    createNotificationPopup() {
        const popup = document.createElement('div');
        popup.id = 'downloadNotification';
        popup.className = 'download-notification';
        document.body.appendChild(popup);
    }

    showNotification(message, type = 'info') {
        const popup = document.getElementById('downloadNotification');
        if (!popup) return;

        popup.textContent = message;
        popup.className = `download-notification ${type} show`;

        if (this.notificationTimeout) {
            clearTimeout(this.notificationTimeout);
        }

        this.notificationTimeout = setTimeout(() => {
            popup.classList.remove('show');
        }, 4000);
    }

    renderDownloadPanel() {
        const content = document.getElementById('downloadPanelContent');
        if (!content) return;

        if (this.downloads.size === 0) {
            content.innerHTML = `
                <div class="download-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    <p>No downloads</p>
                </div>
            `;
            return;
        }

        content.innerHTML = '';

        // Sort by start time (newest first)
        const sorted = Array.from(this.downloads.values()).sort((a, b) => b.startTime - a.startTime);

        sorted.forEach(download => {
            const entry = this.createDownloadEntry(download);
            content.appendChild(entry);
        });
    }

    createDownloadEntry(download) {
        const entry = document.createElement('div');
        entry.className = `download-entry ${download.state}`;

        const progress = download.totalBytes > 0
            ? Math.round((download.receivedBytes / download.totalBytes) * 100)
            : 0;

        const size = this.formatBytes(download.totalBytes);
        const received = this.formatBytes(download.receivedBytes);

        let statusText = '';
        let actionButtons = '';

        switch (download.state) {
            case 'progressing':
                statusText = `${received} / ${size} (${progress}%)`;
                actionButtons = `
                    <button class="download-action pause" data-id="${download.id}" title="Pause">
                        <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                    </button>
                    <button class="download-action cancel" data-id="${download.id}" title="Cancel">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                `;
                break;
            case 'paused':
                statusText = `Paused - ${received} / ${size}`;
                actionButtons = `
                    <button class="download-action resume" data-id="${download.id}" title="Resume">
                        <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    </button>
                    <button class="download-action cancel" data-id="${download.id}" title="Cancel">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                `;
                break;
            case 'completed':
                statusText = `Completed - ${size}`;
                actionButtons = `
                    <button class="download-action open" data-path="${download.savePath}" title="Open">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                            <polyline points="15 3 21 3 21 9"/>
                            <line x1="10" y1="14" x2="21" y2="3"/>
                        </svg>
                    </button>
                    <button class="download-action folder" data-path="${download.savePath}" title="Show in folder">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                        </svg>
                    </button>
                `;
                break;
            case 'cancelled':
            case 'interrupted':
                statusText = `Failed`;
                actionButtons = '';
                break;
        }

        entry.innerHTML = `
            <div class="download-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                </svg>
            </div>
            <div class="download-info">
                <span class="download-filename">${download.filename}</span>
                <span class="download-status">${statusText}</span>
                ${download.state === 'progressing' ? `<div class="download-progress-bar"><div class="download-progress-fill" style="width: ${progress}%"></div></div>` : ''}
            </div>
            <div class="download-actions">
                ${actionButtons}
            </div>
        `;

        // Add event listeners for action buttons
        entry.querySelectorAll('.download-action').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const path = btn.dataset.path;

                if (btn.classList.contains('pause')) this.pauseDownload(id);
                else if (btn.classList.contains('resume')) this.resumeDownload(id);
                else if (btn.classList.contains('cancel')) this.cancelDownload(id);
                else if (btn.classList.contains('open')) this.openDownload(path);
                else if (btn.classList.contains('folder')) this.showInFolder(path);
            });
        });

        return entry;
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    togglePanel(show = null) {
        const panel = document.getElementById('downloadPanel');
        if (!panel) return;

        if (show === null) {
            show = !this.isPanelOpen;
        }

        this.isPanelOpen = show;
        panel.classList.toggle('open', show);

        if (show) {
            this.renderDownloadPanel();
        }
    }

    // ============================================
    // Event Listeners
    // ============================================

    setupEventListeners() {
        // Downloads button click
        const downloadsBtn = document.getElementById('downloadsBtn');
        if (downloadsBtn) {
            downloadsBtn.addEventListener('click', () => {
                this.togglePanel();
            });
        }

        // Keyboard shortcut
        document.addEventListener('keydown', (e) => {
            // Ctrl+J: Toggle downloads
            if (e.ctrlKey && e.key === 'j') {
                e.preventDefault();
                this.togglePanel();
            }
            // Escape: Close panel
            if (e.key === 'Escape' && this.isPanelOpen) {
                this.togglePanel(false);
            }
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            const panel = document.getElementById('downloadPanel');
            const btn = document.getElementById('downloadsBtn');
            if (this.isPanelOpen && panel && !panel.contains(e.target) && !btn?.contains(e.target)) {
                this.togglePanel(false);
            }
        });
    }
}

// ============================================
// Main Menu Manager
// ============================================
class MainMenuManager {
    constructor() {
        this.isOpen = false;
        this.init();
    }

    init() {
        this.createMenu();
        this.setupEventListeners();
    }

    createMenu() {
        const menu = document.createElement('div');
        menu.id = 'mainMenu';
        menu.className = 'main-menu';
        menu.innerHTML = `
            <div class="main-menu-item" id="menuNewIncognito">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                </svg>
                新建隐身窗口
            </div>
            <div class="main-menu-divider"></div>
            <div class="main-menu-item" id="menuHistory">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                </svg>
                历史记录
            </div>
            <div class="main-menu-item" id="menuKnowledge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                </svg>
                我的知识
            </div>
            <div class="main-menu-item" id="menuSummarize">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10 9 9 9 8 9"/>
                </svg>
                ✨ 摘要页面
            </div>
            <div class="main-menu-item" id="menuExportPDF">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="12" y1="18" x2="12" y2="12"/>
                    <polyline points="9 15 12 12 15 15"/>
                </svg>
                📘 导出知识 PDF
            </div>
            <div class="main-menu-divider"></div>
            <div class="main-menu-item" id="menuSettings">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                设置
            </div>
            <div class="main-menu-item" id="menuDevTools">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="16 18 22 12 16 6"></polyline>
                    <polyline points="8 6 2 12 8 18"></polyline>
                </svg>
                开发者工具
            </div>
        `;
        document.body.appendChild(menu);
    }


    setupEventListeners() {
        const menuBtn = document.getElementById('menuBtn');
        const menu = document.getElementById('mainMenu');
        if (menuBtn) {
            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleMenu();
            });
        } else {
        }

        // Use event delegation on the menu container for better reliability
        if (menu) {
            menu.addEventListener('click', (e) => {
                // Find the clicked menu item
                const menuItem = e.target.closest('.main-menu-item');
                if (!menuItem) {
                    return;
                }
                e.stopPropagation();

                const itemId = menuItem.id;
                if (itemId === 'menuNewIncognito') {
                    this.openIncognitoWindow();
                } else if (itemId === 'menuHistory') {
                    if (window.historyManager) {
                        try {
                            window.historyManager.togglePanel();
                        } catch (err) {
                        }
                    } else {
                        alert('历史记录不可用 - historyManager 未初始化');
                    }
                } else if (itemId === 'menuKnowledge') {
                    if (window.knowledgePanelManager) {
                        window.knowledgePanelManager.open();
                    }
                } else if (itemId === 'menuDownloads') {
                    if (window.downloadManager) {
                        window.downloadManager.togglePanel();
                    }
                } else if (itemId === 'menuSettings') {
                    if (window.settingsManager) {
                        try {
                            window.settingsManager.togglePanel();
                        } catch (err) {
                        }
                    } else {
                        alert('设置不可用 - settingsManager 未初始化');
                    }
                } else if (itemId === 'menuSummarize') {
                    // Check if Knowledge Mode is ON
                    if (!window.knowledgeManager || !window.knowledgeManager.isKnowledgeModeEnabled()) {
                        alert('请启用知识模式以进行总结。');
                        return;
                    }
                    // Trigger summarization
                    if (window.ruleSummarizer && window.summaryModalUI && window.tabManager) {
                        const activeTab = window.tabManager.tabs.get(window.tabManager.activeTabId);
                        if (activeTab && activeTab.webview && activeTab.url && activeTab.url !== 'about:blank') {
                            const extractionScript = `
                                (function() {
                                    const getText = (el) => el.textContent.trim();
                                    const getTextArray = (selector) => {
                                        return Array.from(document.querySelectorAll(selector))
                                            .map(el => getText(el))
                                            .filter(text => text.length > 0);
                                    };
                                    return {
                                        url: window.location.href,
                                        title: document.title || '',
                                        headings: getTextArray('h1'),
                                        subHeadings: getTextArray('h2'),
                                        paragraphs: getTextArray('p').slice(0, 50),
                                        lists: getTextArray('li').slice(0, 100),
                                        timestamp: new Date().toISOString()
                                    };
                                })();
                            `;
                            activeTab.webview.executeJavaScript(extractionScript)
                                .then(pageContent => {
                                    if (pageContent && (pageContent.paragraphs.length || pageContent.lists.length)) {
                                        const summaryResult = window.ruleSummarizer.summarize(pageContent);
                                        window.summaryModalUI.showSummaryModal(summaryResult);
                                    } else {
                                        alert('此页面没有找到内容可总结。');
                                    }
                                })
                                .catch(err => {
                                    alert('无法从此页面提取内容。');
                                });
                        } else {
                            alert('Navigate to a page first to summarize its content.');
                        }
                    }
                } else if (itemId === 'menuExportPDF') {
                    if (window.knowledgeBookExporter) {
                        window.knowledgeBookExporter.exportBook();
                    } else if (window.knowledgeDB) {
                        window.knowledgeDB.getAllEntries().then(entries => {
                            if (!entries || entries.length === 0) {
                                alert('未找到知识条目。请先启用知识模式并浏览一些页面！');
                            } else {
                                alert('知识库导出准备就绪！找到 ' + entries.length + ' 个条目。');
                            }
                        });
                    } else {
                        alert('知识系统未就绪。');
                    }
                } else if (itemId === 'menuDevTools') {
                    if (window.tabManager) {
                        const activeTab = window.tabManager.tabs.get(window.tabManager.activeTabId);
                        if (activeTab && activeTab.webview) {
                            try {
                                activeTab.webview.openDevTools();
                            } catch (err) {
                                alert('无法打开开发者工具：' + err.message);
                            }
                        } else {
                            alert('没有活动标签页可打开开发者工具。');
                        }
                    } else {
                        alert('标签管理器未初始化。');
                    }
                } else {
                }
                this.toggleMenu(false);
            });
        } else {
        }

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (this.isOpen && menu && !menu.contains(e.target) && !menuBtn?.contains(e.target)) {
                this.toggleMenu(false);
            }
        });

        // Close on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.toggleMenu(false);
            }
        });
    }


    toggleMenu(show = null) {
        const menu = document.getElementById('mainMenu');
        const menuBtn = document.getElementById('menuBtn');
        if (!menu) return;

        if (show === null) {
            show = !this.isOpen;
        }

        this.isOpen = show;
        menu.classList.toggle('open', show);

        // Position menu below button
        if (show && menuBtn) {
            const rect = menuBtn.getBoundingClientRect();
            menu.style.top = `${rect.bottom + 4}px`;
            menu.style.right = `${window.innerWidth - rect.right}px`;
        }
    }

    async openIncognitoWindow() {
        if (window.focusFlowAPI?.incognito) {
            await window.focusFlowAPI.incognito.openWindow();
        }
    }
}

// ============================================
// Incognito UI Setup
// ============================================
function setupIncognitoMode() {
    if (!CONFIG.isIncognito) return;

    // Add incognito indicator to title bar
    const titleBarLeft = document.querySelector('.title-bar-left');
    if (titleBarLeft) {
        const indicator = document.createElement('div');
        indicator.className = 'incognito-indicator';
        indicator.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
            </svg>
            <span>Incognito</span>
        `;
        titleBarLeft.appendChild(indicator);
    }

    // Add incognito class to body
    document.body.classList.add('incognito-mode');

    // Force dark theme in incognito
    document.documentElement.setAttribute('data-theme', 'dark');

    // Hide bookmark button in incognito
    const bookmarkBtn = document.getElementById('bookmarkBtn');
    if (bookmarkBtn) {
        bookmarkBtn.style.display = 'none';
    }

    // Update window title
    document.title = 'Flowmora Browser - Incognito';
}

// ============================================
// Command Palette (Ctrl+K)
// ============================================
class CommandPalette {
    constructor() {
        this.isOpen = false;
        this.selectedIndex = 0;
        this.filteredCommands = [];

        this.commands = [
            { id: 'new-tab', label: 'New Tab', shortcut: 'Ctrl+T', icon: 'plus', action: () => window.tabManager?.createTab() },
            { id: 'close-tab', label: 'Close Tab', shortcut: 'Ctrl+W', icon: 'x', action: () => window.tabManager?.closeTab(window.tabManager.activeTabId) },
            { id: 'history', label: 'Open History', shortcut: 'Ctrl+H', icon: 'clock', action: () => window.historyManager?.togglePanel(true) },
            { id: 'downloads', label: 'Open Downloads', shortcut: 'Ctrl+J', icon: 'download', action: () => window.downloadManager?.togglePanel(true) },
            { id: 'bookmarks', label: 'Show Bookmarks', shortcut: '', icon: 'star', action: () => document.getElementById('allBookmarksBtn')?.click() },
            { id: 'toggle-theme', label: 'Toggle Dark/Light Mode', shortcut: '', icon: 'moon', action: () => window.themeManager?.toggleTheme() },
            { id: 'incognito', label: 'New Incognito Window', shortcut: '', icon: 'user', action: () => window.mainMenuManager?.openIncognitoWindow() },
            { id: 'focus-url', label: 'Focus Address Bar', shortcut: 'Ctrl+L', icon: 'search', action: () => document.getElementById('urlInput')?.focus() },
            { id: 'reload', label: 'Reload Page', shortcut: 'Ctrl+R', icon: 'refresh', action: () => window.tabManager?.reload() },
            { id: 'home', label: 'Go Home', shortcut: '', icon: 'home', action: () => window.tabManager?.goHome() },
        ];

        this.init();
    }

    init() {
        this.createPaletteUI();
        this.setupEventListeners();
    }

    createPaletteUI() {
        const palette = document.createElement('div');
        palette.id = 'commandPalette';
        palette.className = 'command-palette';
        palette.innerHTML = `
            <div class="command-palette-backdrop"></div>
            <div class="command-palette-modal">
                <div class="command-palette-input-wrapper">
                    <svg class="command-palette-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"/>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <input type="text" class="command-palette-input" id="commandPaletteInput" placeholder="Type a command..." autocomplete="off" spellcheck="false">
                    <span class="command-palette-hint">ESC to close</span>
                </div>
                <div class="command-palette-list" id="commandPaletteList"></div>
            </div>
        `;
        document.body.appendChild(palette);

        // Backdrop click closes palette
        palette.querySelector('.command-palette-backdrop').addEventListener('click', () => {
            this.close();
        });
    }

    getIcon(iconName) {
        const icons = {
            'plus': '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
            'x': '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
            'clock': '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
            'download': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
            'star': '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
            'moon': '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
            'user': '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z"/>',
            'search': '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
            'refresh': '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
            'home': '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>'
        };
        return icons[iconName] || icons['search'];
    }

    renderCommands(filter = '') {
        const list = document.getElementById('commandPaletteList');
        if (!list) return;

        this.filteredCommands = this.commands.filter(cmd =>
            cmd.label.toLowerCase().includes(filter.toLowerCase())
        );

        if (this.filteredCommands.length === 0) {
            list.innerHTML = '<div class="command-palette-empty">No commands found</div>';
            return;
        }

        // Reset selection if out of bounds
        if (this.selectedIndex >= this.filteredCommands.length) {
            this.selectedIndex = 0;
        }

        list.innerHTML = this.filteredCommands.map((cmd, index) => `
            <div class="command-palette-item ${index === this.selectedIndex ? 'selected' : ''}" data-index="${index}">
                <div class="command-palette-item-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        ${this.getIcon(cmd.icon)}
                    </svg>
                </div>
                <span class="command-palette-item-label">${cmd.label}</span>
                ${cmd.shortcut ? `<span class="command-palette-item-shortcut">${cmd.shortcut}</span>` : ''}
            </div>
        `).join('');

        // Click handlers
        list.querySelectorAll('.command-palette-item').forEach(item => {
            item.addEventListener('click', () => {
                const index = parseInt(item.dataset.index);
                this.executeCommand(this.filteredCommands[index]);
            });
        });
    }

    executeCommand(command) {
        if (command && command.action) {
            this.close();
            setTimeout(() => command.action(), 50);
        }
    }

    open() {
        const palette = document.getElementById('commandPalette');
        const input = document.getElementById('commandPaletteInput');
        if (!palette || !input) return;

        this.isOpen = true;
        this.selectedIndex = 0;
        palette.classList.add('open');
        input.value = '';
        input.focus();
        this.renderCommands();
    }

    close() {
        const palette = document.getElementById('commandPalette');
        if (!palette) return;

        this.isOpen = false;
        palette.classList.remove('open');
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    moveSelection(direction) {
        if (this.filteredCommands.length === 0) return;

        this.selectedIndex += direction;
        if (this.selectedIndex < 0) this.selectedIndex = this.filteredCommands.length - 1;
        if (this.selectedIndex >= this.filteredCommands.length) this.selectedIndex = 0;

        this.renderCommands(document.getElementById('commandPaletteInput')?.value || '');
    }

    setupEventListeners() {
        const input = document.getElementById('commandPaletteInput');

        if (input) {
            input.addEventListener('input', (e) => {
                this.selectedIndex = 0;
                this.renderCommands(e.target.value);
            });

            input.addEventListener('keydown', (e) => {
                switch (e.key) {
                    case 'ArrowDown':
                        e.preventDefault();
                        this.moveSelection(1);
                        break;
                    case 'ArrowUp':
                        e.preventDefault();
                        this.moveSelection(-1);
                        break;
                    case 'Enter':
                        e.preventDefault();
                        if (this.filteredCommands[this.selectedIndex]) {
                            this.executeCommand(this.filteredCommands[this.selectedIndex]);
                        }
                        break;
                    case 'Escape':
                        e.preventDefault();
                        this.close();
                        break;
                }
            });
        }

        // Global Ctrl+K shortcut
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'k') {
                e.preventDefault();
                this.toggle();
            }
        });
    }
}

// ============================================
// Settings Manager Class
// ============================================
class SettingsManager {
    constructor() {
        this.isPanelOpen = false;
        this.storageKey = 'focusflow-settings';
        this.activeSection = 'search';

        // Default settings
            this.defaults = {
                // Search Engine
                searchEngine: 'chickrubgo',
                // Startup
                startupMode: 'newTab',
                customStartupUrl: '',
                homePage: '',
                usePresetHomePage: false,
                // Privacy
                disableHistoryTracking: false,
                // Downloads
                askBeforeDownload: true,
                downloadPath: '',
                // Appearance
                theme: 'dark',
                zoomLevel: 100,
                fontSize: 14,
                // Performance
                lowMemoryMode: false,
                hardwareAcceleration: true,
                // Security
                blockPopups: true,
                blockThirdPartyCookies: false,
                doNotTrack: false,
                httpsOnly: false,
                // Shortcuts
                shortcuts: {
                    newTab: 'Ctrl+T',
                    closeTab: 'Ctrl+W',
                    reload: 'Ctrl+R',
                    history: 'Ctrl+H',
                    bookmarks: 'Ctrl+B',
                    commandPalette: 'Ctrl+K'
                }
            };

        this.settings = {};
        this.init();
    }

    init() {
        this.loadSettings();
        this.createPanel();
        this.applySettings();
    }

    // ============================================
    // Storage
    // ============================================

    loadSettings() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            this.settings = stored ? { ...this.defaults, ...JSON.parse(stored) } : { ...this.defaults };
        } catch (e) {
            this.settings = { ...this.defaults };
        }
    }

    saveSettings() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
        } catch (e) {
        }
    }

    getSetting(key) {
        return this.settings[key] ?? this.defaults[key];
    }

    setSetting(key, value) {
        this.settings[key] = value;
        this.saveSettings();
        this.applySettings();
    }

    // ============================================
    // Apply Settings
    // ============================================

    applySettings() {
        // Note: Search engine settings are now dynamically read from localStorage via CONFIG getters
        // No need to set CONFIG.searchEngine - it reads from localStorage automatically

        // Apply theme (only if not incognito)
        if (!CONFIG.isIncognito) {
            document.documentElement.setAttribute('data-theme', this.settings.theme);
        }

        // Apply zoom
        document.body.style.zoom = `${this.settings.zoomLevel}%`;

        // Apply font size
        document.documentElement.style.setProperty('--base-font-size', `${this.settings.fontSize}px`);
    }


    getSearchEngines() {
        return [
            { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=' },
            { id: 'bing', name: 'Bing (China)', url: 'https://cn.bing.com/search?q=' },
            { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
            { id: 'brave', name: 'Brave Search', url: 'https://search.brave.com/search?q=' },
            { id: 'chickrubgo', name: 'ChickRubGo', url: 'https://ruanmingze.github.io/ChickRubGo/search?q=' }
        ];
    }

    // ============================================
    // UI Creation
    // ============================================

    createPanel() {
        const panel = document.createElement('div');
        panel.id = 'settingsPanel';
        panel.className = 'settings-panel';
        panel.innerHTML = `
            <div class="settings-panel-header">
                <h2>设置</h2>
                <button class="settings-panel-close" id="settingsPanelClose">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                </button>
            </div>
            <div class="settings-panel-body">
                <nav class="settings-nav">
                    <button class="settings-nav-item active" data-section="search">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        搜索引擎
                    </button>
                    <button class="settings-nav-item" data-section="startup">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        启动
                    </button>
                    <button class="settings-nav-item" data-section="privacy">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                        隐私
                    </button>
                    <button class="settings-nav-item" data-section="downloads">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        下载
                    </button>
                    <button class="settings-nav-item" data-section="appearance">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                        外观
                    </button>
                    <button class="settings-nav-item" data-section="performance">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                        性能
                    </button>
                    <button class="settings-nav-item" data-section="security">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        安全
                    </button>
                    <button class="settings-nav-item" data-section="shortcuts">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="8" x2="6" y2="8"/><line x1="10" y1="8" x2="14" y2="8"/><line x1="18" y1="8" x2="18" y2="8"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="6" y1="16" x2="10" y2="16"/></svg>
                        快捷键
                    </button>
                </nav>
                <div class="settings-content" id="settingsContent">
                    <!-- Content rendered dynamically -->
                </div>
            </div>
        `;
        document.body.appendChild(panel);

        this.setupEventListeners();
        this.renderSection('search');
    }

    renderSection(section) {
        this.activeSection = section;
        const content = document.getElementById('settingsContent');
        if (!content) return;

        // Update nav active state
        document.querySelectorAll('.settings-nav-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.section === section);
        });

        const sections = {
            search: this.renderSearchSection(),
            startup: this.renderStartupSection(),
            privacy: this.renderPrivacySection(),
            downloads: this.renderDownloadsSection(),
            appearance: this.renderAppearanceSection(),
            performance: this.renderPerformanceSection(),
            security: this.renderSecuritySection(),
            shortcuts: this.renderShortcutsSection()
        };

        content.innerHTML = sections[section] || '';
        this.attachSectionListeners(section);
    }

    // ============================================
    // Section Renderers
    // ============================================

    renderSearchSection() {
        const engines = this.getSearchEngines();
        return `
            <div class="settings-section">
                <h3 class="settings-section-title">默认搜索引擎</h3>
                <p class="settings-section-desc">选择地址栏中使用的搜索引擎。</p>
                <div class="settings-radio-group">
                    ${engines.map(e => `
                        <label class="settings-radio">
                            <input type="radio" name="searchEngine" value="${e.id}" ${this.settings.searchEngine === e.id ? 'checked' : ''}>
                            <span class="settings-radio-mark"></span>
                            <span class="settings-radio-label">${e.name}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
            
            <div class="settings-section">
                <h3 class="settings-section-title">预设主页</h3>
                <p class="settings-section-desc">设置浏览器启动和主页按钮使用的页面。</p>
                <div class="settings-toggle-item">
                    <div class="settings-toggle-info">
                        <div class="settings-toggle-label">启用预设主页</div>
                    </div>
                    <div class="settings-toggle" data-setting="usePresetHomePage">
                        <input type="checkbox" ${this.settings.usePresetHomePage ? 'checked' : ''}>
                        <span class="settings-toggle-slider"></span>
                    </div>
                </div>
                <div class="settings-info-box" style="margin-top: 8px;">
                    <p>启用后将使用本地预设主页（preset-home.html），禁用则使用搜索引擎的主页。</p>
                </div>
            </div>
        `;
    }

    renderStartupSection() {
        return `
            <div class="settings-section">
                <h3 class="settings-section-title">启动时</h3>
                <p class="settings-section-desc">选择浏览器打开时的行为。</p>
                <div class="settings-radio-group">
                    <label class="settings-radio">
                        <input type="radio" name="startupMode" value="newTab" ${this.settings.startupMode === 'newTab' ? 'checked' : ''}>
                        <span class="settings-radio-mark"></span>
                        <span class="settings-radio-label">打开新标签页</span>
                    </label>
                    <label class="settings-radio">
                        <input type="radio" name="startupMode" value="restore" ${this.settings.startupMode === 'restore' ? 'checked' : ''}>
                        <span class="settings-radio-mark"></span>
                        <span class="settings-radio-label">恢复上次会话</span>
                    </label>
                    <label class="settings-radio">
                        <input type="radio" name="startupMode" value="custom" ${this.settings.startupMode === 'custom' ? 'checked' : ''}>
                        <span class="settings-radio-mark"></span>
                        <span class="settings-radio-label">打开自定义网站</span>
                    </label>
                </div>
                <div class="settings-input-group" style="margin-top: 12px; ${this.settings.startupMode !== 'custom' ? 'display:none;' : ''}" id="customUrlGroup">
                    <input type="url" class="settings-input" id="customStartupUrl" placeholder="https://example.com" value="${this.settings.customStartupUrl || ''}">
                </div>
            </div>
        `;
    }

    renderPrivacySection() {
        const isKnowledgeModeOn = window.knowledgeManager?.isKnowledgeModeEnabled() || false;

        return `
            <div class="settings-section">
                <h3 class="settings-section-title">🧠 知识模式 - 隐私</h3>
                <div class="privacy-warning-box">
                    <div class="privacy-warning-icon">🔒</div>
                    <div class="privacy-warning-text">
                        <strong>隐私通知</strong><br>
                        除非知识模式开启，否则不会收集任何数据。<br>
                        知识模式仅需要手动激活。
                    </div>
                </div>
                <div class="knowledge-status-row">
                    <span>当前状态：</span>
                    <span class="knowledge-status-badge ${isKnowledgeModeOn ? 'on' : 'off'}">
                        ${isKnowledgeModeOn ? '🟢 ON' : '🔴 OFF'}
                    </span>
                </div>
                <p class="settings-section-desc">使用导航栏中的 🧠 按钮切换知识模式。</p>
            </div>
            
            <div class="settings-section">
                <h3 class="settings-section-title">🗑️ 清除知识数据</h3>
                <p class="settings-section-desc">永久删除所有存储的知识条目。此操作无法撤销。</p>
                <button class="settings-btn danger full-width" id="clearAllKnowledge">
                    🗑️ 清除所有知识数据
                </button>
                <p class="privacy-info-small">这将删除所有 IndexedDB 数据并关闭知识模式。</p>
            </div>

            <div class="settings-section">
                <h3 class="settings-section-title">历史记录</h3>
                ${this.createToggle('disableHistoryTracking', '禁用历史记录跟踪', '您的浏览历史将不会被保存')}
            </div>
            <div class="settings-section">
                <h3 class="settings-section-title">清除浏览数据</h3>
                <div class="settings-btn-group">
                    <button class="settings-btn danger" id="clearHistory">清除历史记录</button>
                    <button class="settings-btn danger" id="clearCache">清除缓存</button>
                    <button class="settings-btn danger" id="clearCookies">清除 Cookies</button>
                </div>
                <button class="settings-btn danger full-width" id="clearAllData" style="margin-top: 12px;">
                    清除所有浏览数据
                </button>
            </div>
        `;
    }

    renderDownloadsSection() {
        return `
            <div class="settings-section">
                <h3 class="settings-section-title">下载设置</h3>
                ${this.createToggle('askBeforeDownload', '询问每个文件的保存位置', '在保存前提示下载位置')}
                <div class="settings-input-group" style="margin-top: 16px;">
                    <label class="settings-label">下载位置（仅显示）</label>
                    <input type="text" class="settings-input" id="downloadPath" value="${this.settings.downloadPath || '默认下载文件夹'}" readonly>
                </div>
            </div>
        `;
    }

    renderAppearanceSection() {
        return `
            <div class="settings-section">
                <h3 class="settings-section-title">主题</h3>
                <div class="settings-radio-group horizontal">
                    <label class="settings-radio-card">
                        <input type="radio" name="theme" value="dark" ${this.settings.theme === 'dark' ? 'checked' : ''}>
                        <div class="settings-radio-card-content">
                            <span class="theme-icon dark">🌙</span>
                            <span>深色</span>
                        </div>
                    </label>
                    <label class="settings-radio-card">
                        <input type="radio" name="theme" value="light" ${this.settings.theme === 'light' ? 'checked' : ''}>
                        <div class="settings-radio-card-content">
                            <span class="theme-icon light">☀️</span>
                            <span>浅色</span>
                        </div>
                    </label>
                    <label class="settings-radio-card">
                        <input type="radio" name="theme" value="system" ${this.settings.theme === 'system' ? 'checked' : ''}>
                        <div class="settings-radio-card-content">
                            <span class="theme-icon system">💻</span>
                            <span>系统</span>
                        </div>
                    </label>
                </div>
            </div>
            <div class="settings-section">
                <h3 class="settings-section-title">UI 缩放：${this.settings.zoomLevel}%</h3>
                <input type="range" class="settings-slider" id="zoomLevel" min="90" max="130" step="5" value="${this.settings.zoomLevel}">
                <div class="settings-slider-labels"><span>90%</span><span>100%</span><span>130%</span></div>
            </div>
            <div class="settings-section">
                <h3 class="settings-section-title">字体大小：${this.settings.fontSize}px</h3>
                <input type="range" class="settings-slider" id="fontSize" min="12" max="18" step="1" value="${this.settings.fontSize}">
                <div class="settings-slider-labels"><span>12px</span><span>14px</span><span>18px</span></div>
            </div>
        `;
    }

    renderPerformanceSection() {
        const usedMemory = Math.round(performance.memory?.usedJSHeapSize / 1024 / 1024) || 'N/A';
        const totalMemory = Math.round(performance.memory?.jsHeapSizeLimit / 1024 / 1024) || 'N/A';

        return `
            <div class="settings-section">
                <h3 class="settings-section-title">内存使用</h3>
                <div class="settings-memory-display">
                    <div class="memory-bar">
                        <div class="memory-bar-fill" style="width: ${performance.memory ? (performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit * 100) : 50}%"></div>
                    </div>
                    <span class="memory-text">${usedMemory} MB / ${totalMemory} MB</span>
                </div>
            </div>
            <div class="settings-section">
                <h3 class="settings-section-title">性能选项</h3>
                ${this.createToggle('lowMemoryMode', '低内存模式', '通过限制后台进程来减少内存使用')}
                ${this.createToggle('hardwareAcceleration', '硬件加速', '在可用时使用 GPU 进行渲染')}
            </div>
        `;
    }

    renderSecuritySection() {
        return `
            <div class="settings-section">
                <h3 class="settings-section-title">安全与隐私</h3>
                ${this.createToggle('blockPopups', '阻止弹出窗口', '防止网站打开弹出窗口')}
                ${this.createToggle('blockThirdPartyCookies', '阻止第三方 Cookies', '防止来自其他网站的跟踪 cookies')}
                ${this.createToggle('doNotTrack', '发送"请勿跟踪"请求', '要求网站不要跟踪您的浏览')}
                ${this.createToggle('httpsOnly', '仅 HTTPS 模式', '连接到不安全网站时发出警告')}
            </div>
        `;
    }

    renderShortcutsSection() {
        const shortcuts = this.settings.shortcuts || this.defaults.shortcuts;
        return `
            <div class="settings-section">
                <h3 class="settings-section-title">键盘快捷键</h3>
                <p class="settings-section-desc">自定义键盘快捷键（只读显示）。</p>
                <div class="settings-shortcuts-list">
                    ${Object.entries(shortcuts).map(([key, value]) => `
                        <div class="settings-shortcut-item">
                            <span class="shortcut-name">${this.formatShortcutName(key)}</span>
                            <span class="shortcut-key">${value}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    formatShortcutName(key) {
        const names = {
            newTab: 'New Tab',
            closeTab: 'Close Tab',
            reload: 'Reload Page',
            history: 'Open History',
            bookmarks: 'Open Bookmarks',
            commandPalette: 'Command Palette'
        };
        return names[key] || key;
    }

    createToggle(key, label, description = '') {
        const checked = this.settings[key];
        return `
            <div class="settings-toggle-item">
                <div class="settings-toggle-info">
                    <span class="settings-toggle-label">${label}</span>
                    ${description ? `<span class="settings-toggle-desc">${description}</span>` : ''}
                </div>
                <label class="settings-toggle">
                    <input type="checkbox" data-setting="${key}" ${checked ? 'checked' : ''}>
                    <span class="settings-toggle-slider"></span>
                </label>
            </div>
        `;
    }

    // ============================================
    // Event Listeners
    // ============================================

    setupEventListeners() {
        // Close button
        document.getElementById('settingsPanelClose')?.addEventListener('click', () => {
            this.togglePanel(false);
        });

        // Nav items
        document.querySelectorAll('.settings-nav-item').forEach(btn => {
            btn.addEventListener('click', () => {
                this.renderSection(btn.dataset.section);
            });
        });

        // Escape to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isPanelOpen) {
                this.togglePanel(false);
            }
        });
    }

    attachSectionListeners(section) {
        // Toggle switches
        document.querySelectorAll('.settings-toggle input[data-setting]').forEach(input => {
            input.addEventListener('change', (e) => {
                this.setSetting(e.target.dataset.setting, e.target.checked);
            });
        });

        // Specific listener for preset home page toggle
        const presetHomeToggle = document.querySelector('.settings-toggle[data-setting="usePresetHomePage"]');
        if (presetHomeToggle) {
            presetHomeToggle.addEventListener('click', () => {
                // Toggle the state
                const currentState = this.getSetting('usePresetHomePage');
                this.setSetting('usePresetHomePage', !currentState);
                // Update the UI
                const input = presetHomeToggle.querySelector('input');
                if (input) {
                    input.checked = !currentState;
                }
            });
        }

        // Radio buttons
        document.querySelectorAll('input[name="searchEngine"]').forEach(input => {
            input.addEventListener('change', (e) => {
                this.setSetting('searchEngine', e.target.value);
            });
        });

        document.querySelectorAll('input[name="startupMode"]').forEach(input => {
            input.addEventListener('change', (e) => {
                this.setSetting('startupMode', e.target.value);
                const customGroup = document.getElementById('customUrlGroup');
                if (customGroup) {
                    customGroup.style.display = e.target.value === 'custom' ? 'block' : 'none';
                }
            });
        });

        document.querySelectorAll('input[name="theme"]').forEach(input => {
            input.addEventListener('change', (e) => {
                this.setSetting('theme', e.target.value);
            });
        });

        // Custom URL input
        document.getElementById('customStartupUrl')?.addEventListener('change', (e) => {
            this.setSetting('customStartupUrl', e.target.value);
        });

        // Home page input
        document.getElementById('customHomePage')?.addEventListener('change', (e) => {
            this.setSetting('homePage', e.target.value);
        });

        // Sliders
        document.getElementById('zoomLevel')?.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            this.setSetting('zoomLevel', val);
            const title = e.target.closest('.settings-section')?.querySelector('.settings-section-title');
            if (title) title.textContent = `UI Zoom: ${val}%`;
        });

        document.getElementById('fontSize')?.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            this.setSetting('fontSize', val);
            const title = e.target.closest('.settings-section')?.querySelector('.settings-section-title');
            if (title) title.textContent = `Font Size: ${val}px`;
        });

        // Clear data buttons
        document.getElementById('clearHistory')?.addEventListener('click', () => {
            if (confirm('确定清除所有浏览历史？')) {
                localStorage.removeItem('focusflow-history');
                if (window.historyManager) window.historyManager.history = [];
                alert('历史记录已清除！');
            }
        });

        document.getElementById('clearCache')?.addEventListener('click', () => {
            if (confirm('确定清除缓存？（在 Web 中不完全支持）')) {
                alert('已请求清除缓存。');
            }
        });

        document.getElementById('clearCookies')?.addEventListener('click', () => {
            if (confirm('确定清除 Cookie？（在 Web 中不完全支持）')) {
                alert('已请求清除 Cookie。');
            }
        });

        document.getElementById('clearAllData')?.addEventListener('click', () => {
            if (confirm('确定清除所有浏览数据，包括历史记录、缓存和 Cookie？')) {
                localStorage.removeItem('focusflow-history');
                localStorage.removeItem('focusflow-closed-tabs');
                if (window.historyManager) {
                    window.historyManager.history = [];
                    window.historyManager.recentlyClosed = [];
                }
                alert('所有浏览数据已清除！');
            }
        });

        // Clear All Knowledge Data
        document.getElementById('clearAllKnowledge')?.addEventListener('click', async () => {
            if (confirm('⚠️ 删除所有知识数据？\n\n这将：\n• 删除所有存储的知识条目\n• 关闭知识模式\n• 此操作无法撤销！')) {
                try {
                    // Clear IndexedDB
                    if (window.knowledgeDB) {
                        await window.knowledgeDB.clearAllKnowledge();
                    }

                    // Turn Knowledge Mode OFF
                    if (window.knowledgeManager) {
                        window.knowledgeManager.disable();
                    }

                    // Re-render the privacy section to update status
                    this.renderSection('privacy');

                    alert('✅ 所有知识数据已清除。\n知识模式已关闭。');
                } catch (err) {
                    alert('清除知识数据失败：' + err.message);
                }
            }
        });
    }

    togglePanel(show = null) {
        const panel = document.getElementById('settingsPanel');
        if (!panel) return;

        if (show === null) {
            show = !this.isPanelOpen;
        }

        this.isPanelOpen = show;
        panel.classList.toggle('open', show);
    }
}

// ============================================
// Initialize Application
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // Setup incognito mode first
    setupIncognitoMode();

    // Initialize managers with error handling
    try {
        window.tabManager = new TabManager();
    } catch (e) {
    }

    try {
        window.themeManager = new ThemeManager();
    } catch (e) {
    }

    try {
        window.mainMenuManager = new MainMenuManager();
    } catch (e) {
    }

    try {
        window.downloadManager = new DownloadManager();
    } catch (e) {
    }

    try {
        window.commandPalette = new CommandPalette();
    } catch (e) {
    }

    try {
        const sm = new SettingsManager();
        window.settingsManager = sm;
    } catch (e) {
    }

    // Initialize Knowledge Manager
    try {
        const km = new KnowledgeManager();
        window.knowledgeManager = km;
    } catch (e) {
    }

    // Initialize Knowledge Classifier
    try {
        const kc = new KnowledgeClassifier();
        window.knowledgeClassifier = kc;
    } catch (e) {
    }

    // Initialize Knowledge Database (IndexedDB)
    try {
        const kdb = new KnowledgeDB();
        window.knowledgeDB = kdb;
        // Set up auto-save for classified content
        window.addEventListener('pageContentClassified', async (event) => {
            const { content } = event.detail;

            // Check if Knowledge Mode is enabled
            if (!window.knowledgeManager || !window.knowledgeManager.isKnowledgeModeEnabled()) {
                return;
            }

            // Check if URL already exists to avoid duplicates
            try {
                const exists = await window.knowledgeDB.hasURL(content.url);
                if (exists) {
                    return;
                }

                // Save to IndexedDB
                const saved = await window.knowledgeDB.saveKnowledgeEntry(content);
                // Get updated count
                const count = await window.knowledgeDB.getKnowledgeCount();
            } catch (err) {
            }
        });
    } catch (e) {
    }

    // Initialize Knowledge Panel Manager
    try {
        const kpm = new KnowledgePanelManager();
        window.knowledgePanelManager = kpm;
    } catch (e) {
    }

    // Initialize Knowledge Book Exporter
    try {
        const kbe = new KnowledgeBookExporter();
        window.knowledgeBookExporter = kbe;
    } catch (e) {
    }


    // Only initialize bookmark and history managers in normal mode
    if (!CONFIG.isIncognito) {
        try {
            window.bookmarkManager = new BookmarkManager(window.tabManager);
        } catch (e) {
        }

        try {
            const hm = new HistoryManager(window.tabManager);
            window.historyManager = hm;
        } catch (e) {
        }


        // Update bookmark star when tab changes
        const originalActivateTab = window.tabManager.activateTab.bind(window.tabManager);
        window.tabManager.activateTab = function (tabId) {
            originalActivateTab(tabId);
            if (window.bookmarkManager) {
                window.bookmarkManager.updateStarButton();
            }
        };

        // Hook into navigation to track history
        const originalHandleNavigation = window.tabManager.handleNavigation.bind(window.tabManager);
        window.tabManager.handleNavigation = function (tabId, url) {
            originalHandleNavigation(tabId, url);
            const tab = this.tabs.get(tabId);
            if (tab && window.historyManager) {
                window.historyManager.addToHistory(url, tab.title, tab.favicon);
            }
        };

        // Hook into tab close to track recently closed tabs
        const originalCloseTab = window.tabManager.closeTab.bind(window.tabManager);
        window.tabManager.closeTab = function (tabId) {
            const tab = this.tabs.get(tabId);
            if (tab && tab.url && tab.url !== 'about:blank' && window.historyManager) {
                window.historyManager.addClosedTab(tab.url, tab.title, tab.favicon);
            }
            originalCloseTab(tabId);
        };
    }

    // Download Manager is already initialized at the top
    // Setup additional features
    updateTimeDisplay();
    setInterval(updateTimeDisplay, 1000);

    // Setup nav action buttons
    const downloadsBtn = document.getElementById('downloadsBtn');
    if (downloadsBtn) {
        // Using DownloadManager's built-in listener
    }


    // ============================================
    // Window Control Buttons
    // ============================================
    const minimizeBtn = document.querySelector('.window-btn.minimize');
    const maximizeBtn = document.querySelector('.window-btn.maximize');
    const closeBtn = document.querySelector('.window-btn.close');
    if (minimizeBtn) {
        minimizeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.focusFlowAPI && window.focusFlowAPI.window) {
                window.focusFlowAPI.window.minimize();
            }
        });
    } else {
    }

    if (maximizeBtn) {
        maximizeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.focusFlowAPI && window.focusFlowAPI.window) {
                window.focusFlowAPI.window.maximize();
            }
        });
    } else {
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.focusFlowAPI && window.focusFlowAPI.window) {
                window.focusFlowAPI.window.close();
            }
        });
    } else {
    }

    // ============================================
    // Summarize Button - Rule-Based Summarization
    // ============================================
    const summarizeBtn = document.getElementById('summarizeBtn');
    // Initialize summarizer and modal UI
    window.ruleSummarizer = new RuleBasedSummarizer();
    window.summaryModalUI = new SummaryModalUI();
    if (summarizeBtn) {
        summarizeBtn.addEventListener('click', async (e) => {
            e.stopPropagation();

            // Check if Knowledge Mode is ON
            if (!window.knowledgeManager || !window.knowledgeManager.isKnowledgeModeEnabled()) {
                alert('Enable Knowledge Mode to summarize.');
                return;
            }

            // Get the current active tab's webview
            if (!window.tabManager || !window.tabManager.activeTabId) {
                alert('No active page to summarize.');
                return;
            }

            const activeTab = window.tabManager.tabs.get(window.tabManager.activeTabId);
            if (!activeTab || !activeTab.webview) {
                alert('No active page to summarize.');
                return;
            }

            // Check if the page is about:blank
            if (!activeTab.url || activeTab.url === 'about:blank') {
                alert('Navigate to a page first to summarize its content.');
                return;
            }

            // Extract page content on-demand
            const extractionScript = `
                (function() {
                    const getText = (el) => el.textContent.trim();
                    const getTextArray = (selector) => {
                        return Array.from(document.querySelectorAll(selector))
                            .map(el => getText(el))
                            .filter(text => text.length > 0);
                    };
                    return {
                        url: window.location.href,
                        title: document.title || '',
                        headings: getTextArray('h1'),
                        subHeadings: getTextArray('h2'),
                        paragraphs: getTextArray('p').slice(0, 50),
                        lists: getTextArray('li').slice(0, 100),
                        timestamp: new Date().toISOString()
                    };
                })();
            `;

            try {
                const pageContent = await activeTab.webview.executeJavaScript(extractionScript);

                if (!pageContent || (!pageContent.paragraphs.length && !pageContent.lists.length)) {
                    alert('No content found on this page to summarize.');
                    return;
                }
                // Generate the summary using rule-based summarizer
                const summaryResult = window.ruleSummarizer.summarize(pageContent);
                // Show the summary modal
                window.summaryModalUI.showSummaryModal(summaryResult);

            } catch (err) {
                alert('Failed to extract content from this page.');
            }
        });
    } else {
    }

    // ============================================
    // PDF Export Button - Knowledge Book Export
    // ============================================
    const pdfExportBtn = document.getElementById('pdfExportBtn');
    if (pdfExportBtn) {
        pdfExportBtn.addEventListener('click', async (e) => {
            e.stopPropagation();

            // Check if Knowledge Mode has any entries
            if (!window.knowledgeDB) {
                alert('Knowledge system is not ready. Please try again.');
                return;
            }

            try {
                const entries = await window.knowledgeDB.getAllEntries();

                if (!entries || entries.length === 0) {
                    alert('No knowledge entries found. Browse some pages with Knowledge Mode ON first!');
                    return;
                }

                // Use the existing KnowledgeBookExporter if available
                if (window.knowledgeBookExporter) {
                    window.knowledgeBookExporter.exportBook();
                } else {
                    // Fallback: Generate a simple HTML export
                    const bookContent = generateKnowledgeBookHTML(entries);
                    downloadAsHTML(bookContent, 'Flowmora-Knowledge-Book.html');
                }
            } catch (err) {
                alert('Failed to export Knowledge Book. Please try again.');
            }
        });
    } else {
    }

    // Debug: Add click listener to document to see if clicks are being captured
    document.addEventListener('click', (e) => {
    }, true);
});

