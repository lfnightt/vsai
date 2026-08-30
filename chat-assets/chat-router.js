/*
 * chat-router.js — Chat deep-linking / URL routing
 *
 * Gives every chat a shareable URL:
 *   https://vsai-production.up.railway.app/chat/{uuid}
 *
 * • On page load  — reads the UUID from the path and selects the matching chat.
 * • On chat switch — pushes  /chat/{uuid}  into the address bar (back-button works).
 * • On back/forward — popstate handler selects the correct chat.
 * • Refresh always restores the exact chat.
 *
 * The chat ID ↔ DOM mapping is position-based (same strategy used by
 * chat-features.js activeChatId()).  Injected sidebar buttons
 * (ox-projects-btn-item, ox-updates-btn-item, …) are filtered out so the
 * position count matches the chat array length.
 */

(function () {
    'use strict';

    // ── Config ───────────────────────────────────────────────────────────
    var CHATS_KEY = 'chattest_chats';

    // ── State ────────────────────────────────────────────────────────────
    var lastActiveChatId = null;   // last chat ID we observed (suppresses echo)
    var syncScheduled = false;      // rAF debounce flag
    var observer = null;            // MutationObserver on .sidebar-chats
    var poller = null;              // setInterval fallback

    // ── Local storage ────────────────────────────────────────────────────
    function loadChats() {
        try {
            return JSON.parse(localStorage.getItem(CHATS_KEY)) || [];
        } catch (e) {
            return [];
        }
    }

    // ── DOM helpers ──────────────────────────────────────────────────────

    /**
     * All real chat-item elements in DOM order, excluding injected
     * buttons (Projects, Updates, New Project, project list items …).
     */
    function getRealChatItems() {
        var nodes = document.querySelectorAll('.sidebar-chats .chat-item');
        var real = [];
        for (var i = 0; i < nodes.length; i++) {
            /* injected buttons carry an ox- class prefix */
            if (nodes[i].className.indexOf('ox-') === -1) real.push(nodes[i]);
        }
        return real;
    }

    /**
     * Resolve the currently-active chat's UUID from the DOM.
     * Mirrors the ordering React uses: chats sorted by updatedAt desc.
     */
    function getActiveChatIdFromDom() {
        var items = getRealChatItems();
        var k = -1;
        for (var i = 0; i < items.length; i++) {
            if (items[i].classList.contains('active')) { k = i; break; }
        }
        if (k < 0) return null;

        var chats = loadChats();
        if (chats.length !== items.length) return null;
        chats = chats.slice().sort(function (a, b) {
            return new Date(b.updatedAt) - new Date(a.updatedAt);
        });
        return chats[k] ? String(chats[k].id) : null;
    }

    /**
     * Find the DOM chat-item element whose data matches the given UUID,
     * using position-based mapping.
     */
    function findChatItemById(chatId) {
        var items = getRealChatItems();
        var chats = loadChats();
        if (chats.length !== items.length) return null;
        chats = chats.slice().sort(function (a, b) {
            return new Date(b.updatedAt) - new Date(a.updatedAt);
        });
        for (var i = 0; i < chats.length; i++) {
            if (String(chats[i].id) === String(chatId)) return items[i] || null;
        }
        return null;
    }

    // ── URL helpers ──────────────────────────────────────────────────────

    /** Locale prefix like "/en" or "" */
    function getLocalePrefix() {
        var m = window.location.pathname.match(/^\/([a-z]{2})\//);
        return m ? '/' + m[1] : '';
    }

    /** Extract the chat UUID from the current path, or null. */
    function parseChatIdFromPath() {
        var path = window.location.pathname;
        var m = path.match(/^\/([a-z]{2})\//);
        if (m) path = path.slice(m[0].length - 1); // strip locale, keep '/'
        var cm = path.match(/^\/chat\/([^/?#]+)$/);
        return cm ? cm[1] : null;
    }

    function buildChatUrl(chatId) {
        return getLocalePrefix() + '/chat/' + encodeURIComponent(chatId);
    }

    // ── URL synchronisation ──────────────────────────────────────────────

    /** Compare DOM active-chat with URL and pushState when they diverge. */
    function syncUrl() {
        var chatId = getActiveChatIdFromDom();
        if (chatId === lastActiveChatId) return;     // nothing changed
        lastActiveChatId = chatId;

        if (chatId) {
            var urlChatId = parseChatIdFromPath();
            if (urlChatId !== chatId) {
                history.pushState({ chatId: chatId }, '', buildChatUrl(chatId));
            }
        }
        // When chatId is null we leave the URL as-is — it may be a transient
        // re-render and we don't want to clobber a valid address.
        // delete-chat / not-found cases are handled in selectChatById().
    }

    var syncScheduled = false;
    function scheduleSync() {
        if (syncScheduled) return;
        syncScheduled = true;
        var fn = function () {
            syncScheduled = false;
            syncUrl();
        };
        if (window.requestAnimationFrame) requestAnimationFrame(fn);
        else setTimeout(fn, 16);
    }

    // ── DOM observer ─────────────────────────────────────────────────────
    // Watches .sidebar-chats for active-class toggles and new/removed items.
    function setupObserver() {
        var container = document.querySelector('.sidebar-chats');
        if (!container) {
            setTimeout(setupObserver, 200);
            return;
        }
        observer = new MutationObserver(function () {
            scheduleSync();
        });
        observer.observe(container, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
    }

    // ── URL → chat selection ─────────────────────────────────────────────

    /**
     * Click the chat-item that corresponds to chatId.
     * Retries until the sidebar has rendered and lengths match.
     * Cleans up the URL (replaceState → /chat) if the chat is not found.
     */
    function selectChatById(chatId) {
        // Suppress syncUrl echo: pretend we already "saw" this chat so the
        // poller/observer don't push a duplicate history entry.
        lastActiveChatId = chatId;

        var attempts = 0;
        var maxAttempts = 80;               // 80 × 150 ms = 12 s ceiling

        function trySelect() {
            var item = findChatItemById(chatId);
            if (item) {
                item.click();
                return;
            }
            attempts++;
            if (attempts < maxAttempts) {
                setTimeout(trySelect, 150);
            } else {
                // Chat not found — it was deleted or the UUID is invalid.
                // Clean the URL so the user lands on a fresh /chat.
                history.replaceState({}, '', getLocalePrefix() + '/chat');
                lastActiveChatId = null;
            }
        }
        trySelect();
    }

    // ── Initialise ───────────────────────────────────────────────────────
    function init() {
        // Reactive observer (immediate response)
        setupObserver();

        // Polling fallback (catches anything the observer misses)
        poller = setInterval(syncUrl, 500);

        // 1. Deep-link on first load
        var urlChatId = parseChatIdFromPath();
        if (urlChatId) {
            selectChatById(urlChatId);
        }

        // 2. Back / forward buttons
        window.addEventListener('popstate', function () {
            var chatId = parseChatIdFromPath();
            if (chatId) {
                selectChatById(chatId);
            } else {
                lastActiveChatId = null;
            }
        });
    }

    // Bootstrap — wait for DOMContentLoaded if the script hasn't loaded yet
    // Wrapped in try/catch so this script can never break the rest of the page.
    function bootstrap() {
        try {
            init();
        } catch (e) {
            console.error('[chat-router] init failed:', e);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
        bootstrap();
    }
})();
