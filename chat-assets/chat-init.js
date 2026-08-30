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
                        init = Object.assign({}, init, { body: JSON.stringify(body) });
                        args = [input, init];
                    }
                }
            } catch (e) {}
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
        return send().then(track, function(e) {
            setPhase('idle');
            throw e;
        });
    };
})();
