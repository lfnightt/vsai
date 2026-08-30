window.__CHAT_MODELS__ = [{
    "id": "stealth\/ox-alpha",
    "slug": "ox-alpha",
    "name": "Ox Alpha",
    "color": "#6e56cf"
}];
window.__CHAT_SITE_NAME__ = "AI Chat";
window.__CHAT_LOGO__ = './chat-logo.svg';
window.__CHAT_LANG__ = null;
window.__CHAT_IMAGES__ = {
    "max": 0,
    "maxBytes": 5242880,
    "history": 4
};
window.__CHAT_FILES__ = {
    "max": 3,
    "maxBytes": 102400
};
// Sidebar starts collapsed by default. Applied once per browser (flag), after which the
// app keeps persisting whatever the user chooses.
try {
    if (localStorage.getItem('ox_sidebar_default_v2') === null) {
        localStorage.setItem('chattest_sidebar_collapsed', 'true');
        localStorage.setItem('ox_sidebar_default_v2', '1');
    }
} catch (e) {}

// Response phase tracker for the "Thinking…" status. Wraps
// (keep-alives only → queued, reasoning deltas → thinking, first content → answering).
// Never alters the bytes the app receives.
window.__oxPhase = 'idle';
window.__oxPhaseAt = 0;
(function() {
    var nativeFetch = window.fetch;
    if (!nativeFetch || !window.TransformStream || !window.TextDecoder) return;

    function setPhase(p) {
        if (window.__oxPhase !== p) {
            window.__oxPhase = p;
            window.__oxPhaseAt = Date.now();
        }
    }

    // Simple inline notice (used for search errors before chat-features.js loads)
    function showNotice(msg) {
        var existing = document.querySelector('.ox-inline-notice');
        if (existing) existing.remove();
        var messagesCol = document.querySelector('.messages-col');
        if (!messagesCol) return;
        var el = document.createElement('div');
        el.className = 'ox-inline-notice';
        el.style.cssText = 'margin:12px auto 4px;max-width:90%;padding:8px 16px;border-radius:12px;font-size:13px;color:var(--text-secondary);background:rgba(124,102,230,0.08);border:1px solid var(--border);display:inline-flex;align-items:center;gap:6px;';
        var text = document.createElement('span');
        text.textContent = msg;
        el.appendChild(text);
        messagesCol.appendChild(el);
        setTimeout(function() {
            el.style.transition = 'opacity 0.3s';
            el.style.opacity = '0';
            setTimeout(function() { if (el.parentNode) el.remove(); }, 300);
        }, 3000);
    }

    // ── Web Search integration ──────────────────────────────────────────
    // Detects search intent in the user's message, calls /api/search, and
    // injects results as context before the chat request is sent.
    // Triggered by: [SEARCH]query[/SEARCH], /search query, or search keywords
    // (both English and Persian).
    function oxDetectSearch(body) {
        try {
            var parsed = JSON.parse(body);
            if (!Array.isArray(parsed.messages) || parsed.messages.length === 0) return null;

            // Find the last user message
            var last = null;
            for (var i = parsed.messages.length - 1; i >= 0; i--) {
                if (parsed.messages[i].role === 'user' && typeof parsed.messages[i].content === 'string') {
                    last = parsed.messages[i].content;
                    break;
                }
            }
            if (!last) return null;

            var trimmed = last.trim();

            // 1. Explicit directive: [SEARCH]query[/SEARCH] (case-insensitive close tag)
            var searchedTags = trimmed.match(/\[SEARCH\]([^]+?)\[\/search\]/i)
                             || trimmed.match(/\[SEARCH\]([^]+?)\[\/SEARCH\]/i);
            if (searchedTags) return { query: searchedTags[1].trim() };

            // 2. Command: /search query
            var searchedCmd = /^\/search\s+(.+)$/i.exec(trimmed);
            if (searchedCmd) return { query: searchedCmd[1].trim() };

            // 3. Keyword-based detection (English + Persian)
            // Patterns where query follows the keyword:
            //   "search for X", "look up X", "جستجو بکن X", "سرچ بکن X", "بگرد X"
            var afterMatch = trimmed.match(
                /\b(?:search\s+(?:for|the web for)|look up|find(?:\s+me|\s+the latest)?|web search|find info(?:\s+on)?|find out about)\s+(.+)/i
            ) || trimmed.match(/جستجو\s+(?:کن|بکن|بزن)\s+(.+)/i)
            || trimmed.match(/سرچ\s+(?:کن|بکن|بزن)\s+(.+)/i)
            || trimmed.match(/بگرد\s+(?:در\s+)?(.+)/i)
            || trimmed.match(/دنبال\s+(.+?)\s+بگرد/i)
            || trimmed.match(/وب\s+جستجو\s+(?:کن|بکن|بزن)\s+(.+)/i)
            || trimmed.match(/وب\s+جستجو\s+(.+)/i)
            || trimmed.match(/جست\s+و\s+گردان\s+برای\s+(.+)/i);
            if (afterMatch && afterMatch[1]) {
                var q = afterMatch[1].replace(/[?.!،،]+$/, '').trim();
                if (q.length >= 1) return { query: q };
            }

            // Patterns where query precedes the keyword:
            //   "X رو جستجو کن", "X سرچ بکن", "X رو بگرد"
            var beforeMatch = trimmed.match(/(.+?)\s+(?:رو|را?)\s+(?:جستجو\s+(?:کن|بکن|بزن)|سرچ\s+(?:کن|بکن|بزن)|دنبال\s+بگرد|بگرد)/i)
                             || trimmed.match(/(.+?)\s+(?:جستجو\s+(?:کن|بکن|بزن)|سرچ\s+(?:کن|بکن|بزن)|دنبال\s+بگرد)/i);
            if (beforeMatch && beforeMatch[1]) {
                var q2 = beforeMatch[1].replace(/[?.!،،]+$/, '').trim();
                if (q2.length >= 1) return { query: q2 };
            }

            // "در مورد X جستجو کن" / "جستجو کن در مورد X"
            var aboutMatch = trimmed.match(/(?:در\s+مورد|در\s+باره|دربارهٔ|درباره)\s+(.+)/i);
            if (aboutMatch && aboutMatch[1]) {
                var q3 = aboutMatch[1].replace(/[?.!،،]+$/, '').trim();
                if (q3.length >= 1) {
                    // Only treat as search if the message also contains a search keyword
                    if (trimmed.match(/جستجو|سرچ|وب\s+جستجو|جست\s+و\s+گردان|search\s+for|look\s+up|web\s+search|find\s+out|بگرد/i)) {
                        return { query: q3 };
                    }
                }
            }

            return null;
        } catch (e) {
            return null;
        }
    }

    function oxDoSearch(query) {
        return nativeFetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'search-combo',
                query: query,
                max_results: 5
            })
        }).then(function(r) {
            if (!r.ok) return { _error: true, message: 'سرور جستجو خطا داد: ' + r.status };
            return r.json();
        }).then(function(data) {
            if (data && data._error) return 'خطا در جستجو: ' + data.message;
            if (data && data.results && data.results.length > 0) {
                var formatted = '--- نتایج جستجوی وب برای "' + query + '" ---\n\n';
                data.results.forEach(function(r, i) {
                    formatted += (i + 1) + '. ' + (r.title || 'بدون عنوان') + '\n';
                    formatted += '   لینک: ' + (r.url || '') + '\n';
                    formatted += '   خلاصه: ' + (r.snippet || r.content || '').slice(0, 300) + '\n\n';
                });
                if (data.answer) formatted += 'پاسخ مستقیم: ' + data.answer + '\n\n';
                return formatted;
            }
            return 'جستجو برای "' + query + '" انجام شد اما نتیجه‌ای یافت نشد.';
        }).catch(function(e) {
            return 'خطا در جستجو: ' + (e.message || 'نا مشخص');
        });
    }

    // ── Phase-aware "Searching…" status ───────────────────────────────
    function showSearchStatus(msg) {
        var existing = document.querySelector('.ox-creating-file-status');
        if (existing) existing.remove();

        var messagesCol = document.querySelector('.messages-col');
        if (!messagesCol) return;

        var el = document.createElement('div');
        el.className = 'ox-creating-file-status';
        el.setAttribute('role', 'status');
        el.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 16px;font-size:13px;color:var(--text-secondary);';

        var spinner = document.createElement('div');
        spinner.style.cssText = 'width:14px;height:14px;border:2px solid var(--border);border-top-color:var(--accent,#7a7a8a);border-radius:50%;animation:spin 0.6s linear infinite;';
        el.appendChild(spinner);

        var text = document.createElement('span');
        text.textContent = msg;
        el.appendChild(text);

        messagesCol.appendChild(el);
        return el;
    }

    function removeSearchStatus() {
        var el = document.querySelector('.ox-creating-file-status');
        if (el) el.remove();
    }

    window.fetch = function(input, init) {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        if (url.indexOf('api.php') === -1 && url.indexOf('/api/chat') === -1) return nativeFetch.apply(this, arguments);
        input = './api/chat';
        var self = this,
            args = [input, init];
        if (typeof window.__oxRewriteChatBody === 'function' && init && typeof init.body === 'string') {
            try {
                var rewritten = window.__oxRewriteChatBody(init.body);
                if (typeof rewritten === 'string' && rewritten !== init.body) {
                    init = Object.assign({}, init, {
                        body: rewritten
                    });
                    args = [input, init];
                }
            } catch (e) {}
        }

        // ── Project context injection (CRITICAL) ─────────────────────────
        // When a project is active, append project name, all file contents,
        // and instructions so the AI knows it's working in a project context.
        if (init && typeof init.body === 'string' && window.__oxProjects) {
            try {
                var proj = window.__oxProjects.getActive();
                if (proj) {
                    var body = JSON.parse(init.body);
                    if (Array.isArray(body.messages)) {
                        var projCtx = '';
                        projCtx += 'You are currently working in a project called "' + proj.name + '".\n';

                        if (proj.files && proj.files.length > 0) {
                            projCtx += 'The project contains ' + proj.files.length + ' file(s):\n\n';
                            proj.files.forEach(function(f) {
                                projCtx += '--- ' + f.name + ' ---\n' + (f.content || '(empty)') + '\n\n';
                            });
                        } else {
                            projCtx += 'The project currently has no files.\n\n';
                        }

                        projCtx += 'When the user asks you to create or modify code, generate it as files in this project.\n';
                        projCtx += 'When you create or update a file, respond with the COMPLETE file content wrapped in a code block with the file extension as the language.\n';
                        projCtx += 'If the user asks to modify an existing file, show the FULL updated file (not just a diff).\n';
                        projCtx += 'Files you generate in code blocks are automatically saved to this project — no manual saving needed.\n';

                        // Find the system message and append project context
                        var hasSystem = false;
                        for (var pi = 0; pi < body.messages.length; pi++) {
                            if (body.messages[pi].role === 'system') {
                                body.messages[pi].content += '\n\n' + projCtx;
                                hasSystem = true;
                                break;
                            }
                        }
                        if (!hasSystem) {
                            body.messages.unshift({ role: 'system', content: projCtx });
                        }

                        // Update init.body with project context (always, regardless of search)
                        init = Object.assign({}, init, {
                            body: JSON.stringify(body)
                        });
                        args = [input, init];
                    }
                }
            } catch (e) {}
        }

        // ── Web Search: if detected (outside project context too) ──────
        var searchPromise = Promise.resolve();
        if (init && typeof init.body === 'string') {
            var si = oxDetectSearch(init.body);
            if (si && si.query) {
                setPhase('connecting');
                showSearchStatus('در حال جستجو در وب...');

                searchPromise = oxDoSearch(si.query).then(function(results) {
                    removeSearchStatus();
                    // Only inject results if they're not error messages
                    if (results && typeof results === 'string' && results.indexOf('خطا در جستجو') !== 0 && results.indexOf('خطا:') !== 0) {
                        var bodyObj;
                        try { bodyObj = JSON.parse(init.body); } catch(e) { bodyObj = null; }
                        if (bodyObj && Array.isArray(bodyObj.messages)) {
                            // Truncate results to avoid context overflow
                            var truncated = results.length > 2000 ? results.slice(0, 2000) + '\n...(نتایج برش‌خورده)' : results;
                            bodyObj.messages.push({
                                role: 'system',
                                content: 'اطلاعات جستجو از وب:\n' + truncated
                            });
                        }
                        init = Object.assign({}, init, {
                            body: bodyObj ? JSON.stringify(bodyObj) : init.body
                        });
                        args = [input, init];
                    } else {
                        // Search failed — just proceed without search results
                        showNotice('جستجو انجام نشد، همچنان سعی می‌کنم کمک کنم...');
                    }
                }).catch(function(e) {
                    // Search request failed — proceed with original request
                    removeSearchStatus();
                    showNotice('جستجو ناموفق بود، ادامه می‌دهم...');
                });
            }
        }

        setPhase('connecting');

        function send(extraHeaders) {
            console.debug('[api] sending to:', input, 'method:', init && init.method);
            if (!extraHeaders) return nativeFetch.apply(self, args);
            var init2 = Object.assign({}, init || {});
            var h = new Headers(init2.headers || {});
            Object.keys(extraHeaders).forEach(function(k) {
                h.set(k, extraHeaders[k]);
            });
            init2.headers = h;
            return nativeFetch.call(self, input, init2);
        }

        function track(res) {
            console.debug('[api] response status:', res && res.status, 'ok:', res && res.ok);
            if (!res.ok || !res.body) {
                setPhase('idle');
                return res;
            }
            try {
                var trimmed = parseInt(res.headers.get('X-Context-Trimmed') || '0', 10);
                if (trimmed > 0 && typeof window.__oxContextTrimmed === 'function') window.__oxContextTrimmed(trimmed, parseInt(res.headers.get('X-Context-Sent') || '0', 10));
            } catch (e) {}
            var decoder = new TextDecoder();
            var tail = '';
            var debugCount = 0;
            var ts = new TransformStream({
                transform: function(chunk, controller) {
                    controller.enqueue(chunk);
                    var text = tail + decoder.decode(chunk, {
                        stream: true
                    });
                    tail = text.slice(-64);
                    if (debugCount < 3) {
                        console.debug('[api] chunk', debugCount++, JSON.stringify(text.slice(0, 200)));
                    }
                    if (/"content":"[^"]/.test(text)) setPhase('answering');
                    else if (/"reasoning":"[^"]/.test(text)) {
                        if (window.__oxPhase !== 'answering') setPhase('thinking');
                    } else if (window.__oxPhase === 'connecting' && text.indexOf('PROCESSING') !== -1) setPhase('queued');
                },
                flush: function() {
                    setPhase('idle');
                }
            });
            return new Response(res.body.pipeThrough(ts), {
                status: res.status,
                statusText: res.statusText,
                headers: res.headers
            });
        }

        // Wait for search to complete (if any), then send the chat request
        return searchPromise.then(function() {
            return send().then(track, function(e) {
                setPhase('idle');
                throw e;
            });
        });
    };
})();
