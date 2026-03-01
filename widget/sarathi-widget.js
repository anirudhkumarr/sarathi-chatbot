(function () {
    "use strict";

        var DEFAULTS = {
        serverUrl: "http://localhost:5005/webhooks/rest/webhook",
        botName: "Sarathi - Campus Assistant",
        subtitle: "You can ask me anything",
        greeting:
            "Hello! I\u2019m Sarathi, your AI campus assistant. Ask me about admissions, scholarships, fees, exams, or academics.",
        starterPrompts: [
            "What is the admission process?",
            "Scholarship options available?",
            "Fee payment deadlines?",
            "Exam schedule details?",
        ],
        theme: {
            primary: "#7C3AED",
            secondary: "#3B82F6",
            fontFamily: "'DM Sans', sans-serif",
        },
        requestTimeoutMs: 0,
        language: document.documentElement.lang || "en",
        position: "right",
    };

    var MSG = {
        thinking: "Searching relevant documents\u2026",
        error:
            "I couldn\u2019t reach the assistant right now. Please try again in a moment.",
        timeout:
            "The response is taking too long. Please try a shorter question.",
        empty:
            "I didn\u2019t receive a clear response. Please rephrase your question.",
        newSession: "New conversation started.",
    };

        var ICON = {
        chat:
            '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
        close:
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        send:
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
        menu:
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
        minimize:
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="6" y1="12" x2="18" y2="12"/></svg>',
        chevron:
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
        refresh:
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
        sun:
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
        moon:
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
        newChat:
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    };

        function deepMerge(a, b) {
        var out = {};
        var k;
        for (k in a)
            if (a.hasOwnProperty(k)) out[k] = a[k];
        for (k in b)
            if (b.hasOwnProperty(k)) {
                if (
                    typeof b[k] === "object" &&
                    b[k] !== null &&
                    !Array.isArray(b[k]) &&
                    typeof out[k] === "object" &&
                    out[k] !== null
                )
                    out[k] = deepMerge(out[k], b[k]);
                else out[k] = b[k];
            }
        return out;
    }

    function createSenderId() {
        if (window.crypto && typeof window.crypto.randomUUID === "function")
            return "sarathi-" + window.crypto.randomUUID();
        return (
            "sarathi-" +
            Date.now().toString(36) +
            "-" +
            Math.random().toString(36).slice(2, 10)
        );
    }

    function escapeHtml(t) {
        return String(t)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function fmtInline(t) {
        var s = escapeHtml(t);
        s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
        s = s.replace(/__(.+?)__/g, "<strong>$1</strong>");
        s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
        s = s.replace(/\*(?!\s)([^*]+?)\*/g, "<em>$1</em>");
        return s;
    }

    function fmtRich(text) {
        var lines = String(text || "")
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .split("\n");
        var parts = [],
            inUl = false,
            inOl = false;
        function close() {
            if (inUl) {
                parts.push("</ul>");
                inUl = false;
            }
            if (inOl) {
                parts.push("</ol>");
                inOl = false;
            }
        }
        lines.forEach(function (line) {
            var t = line.trim();
            if (!t) {
                close();
                return;
            }
            var ul = t.match(/^[-*]\s+(.+)$/);
            var ol = t.match(/^\d+\.\s+(.+)$/);
            var hd = t.match(/^#{1,6}\s+(.+)$/);
            if (ul) {
                if (!inUl) {
                    close();
                    parts.push("<ul>");
                    inUl = true;
                }
                parts.push("<li>" + fmtInline(ul[1]) + "</li>");
                return;
            }
            if (ol) {
                if (!inOl) {
                    close();
                    parts.push("<ol>");
                    inOl = true;
                }
                parts.push("<li>" + fmtInline(ol[1]) + "</li>");
                return;
            }
            close();
            if (hd)
                parts.push('<p class="sw-heading">' + fmtInline(hd[1]) + "</p>");
            else parts.push("<p>" + fmtInline(t) + "</p>");
        });
        close();
        return parts.join("");
    }

    function splitSources(text) {
        var v = String(text || "").trim();
        var m = /(?:^|\n)\s*(sources?)\s*:\s*/i.exec(v);
        if (!m) return { answer: v, source: "" };
        return {
            answer: v.slice(0, m.index).trim(),
            source: v
                .slice(m.index)
                .trim()
                .replace(/^(sources?)\s*:\s*/i, "")
                .trim(),
        };
    }

        function buildCSS(cfg) {
        var p = cfg.theme.primary || "#4F46E5";
        var s = cfg.theme.secondary || "#6366F1";
        var ff = cfg.theme.fontFamily || "'Inter', sans-serif";
        var pos = cfg.position === "left" ? "left" : "right";

        return (
            "\n" +
                        "#sw-root,#sw-root *,#sw-root *::before,#sw-root *::after{box-sizing:border-box;margin:0;padding:0;border:0;font-family:" + ff + ";-webkit-font-smoothing:antialiased}\n" +

                        "#sw-root{" +
            "--sw-primary:" + p + ";" +
            "--sw-secondary:" + s + ";" +
            "--sw-text:#1f2937;--sw-text-l:#6b7280;" +
            "--sw-bg:#ffffff;" +
            "--sw-msg-bg:#f9fafb;" +
            "--sw-border:#e5e7eb;" +
            "--sw-border-l:#f3f4f6;" +
            "--sw-sh-p:0 20px 40px -8px rgba(0,0,0,0.15);" +
            "--sw-sh-b:0 2px 8px rgba(0,0,0,0.06);" +
            "--sw-sh-l:0 8px 16px rgba(79,70,229,0.3);" +
            "--sw-r-p:24px;--sw-r-b:16px;--sw-r-c:12px;" +
            "position:fixed;" + pos + ":24px;bottom:24px;z-index:2147483000;" +
            "font-family:" + ff + ";font-size:14px;line-height:1.5;color:var(--sw-text);" +
            "display:flex;flex-direction:column;align-items:flex-" + (pos === "right" ? "end" : "start") + "}\n" +

                        "#sw-root .sw-panel{width:min(280px,calc(100vw - 48px));height:min(440px,75vh);" +
            "margin-bottom:16px;border-radius:var(--sw-r-p);background:var(--sw-bg);" +
            "box-shadow:var(--sw-sh-p);display:flex;flex-direction:column;overflow:hidden;" +
            "opacity:0;transform:translateY(20px) scale(.98);pointer-events:none;" +
            "transition:opacity 250ms cubic-bezier(.4,0,.2,1),transform 250ms cubic-bezier(.4,0,.2,1);" +
            "will-change:opacity,transform}\n" +
            "#sw-root.sw-open .sw-panel{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}\n" +

                        "#sw-root .sw-resize{position:absolute;top:0;left:0;width:20px;height:20px;cursor:nw-resize;z-index:20;" +
            "border-radius:var(--sw-r-p) 0 8px 0;overflow:hidden;background:transparent;}" + "\n" +
            "#sw-root .sw-resize::after{content:'';position:absolute;top:0;left:0;width:100%;height:100%;" +
            "background:linear-gradient(135deg, rgba(96,165,250,0.5) 0%, rgba(99,102,241,0.3) 40%, transparent 70%);" +
            "transition:opacity 200ms;opacity:0.6;}" + "\n" +
            "#sw-root .sw-resize:hover::after{opacity:1;}" + "\n" +
            "#sw-root.sw-resizing .sw-panel{transition:none!important;user-select:none;}" + "\n" +

                        "#sw-root .sw-header{background:#ffffff;" +
            "border-bottom:1px solid var(--sw-border);padding:12px 14px;" +
            "display:flex;align-items:center;gap:10px;flex-shrink:0;position:relative;z-index:10}\n" +

            "#sw-root .sw-hdr-av{width:36px;height:36px;" +
            "display:flex;align-items:center;justify-content:center;flex-shrink:0;}\n" +

            "#sw-root .sw-hdr-info{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;}\n" +
            "#sw-root .sw-hdr-name{font-size:13px;font-weight:600;color:#111827;line-height:1.2;}\n" +
            "#sw-root .sw-hdr-sub{display:flex;align-items:center;gap:5px;margin-top:1px}\n" +
            "#sw-root .sw-hdr-dot{width:6px;height:6px;background:#10B981;border-radius:50%;box-shadow:0 0 0 2px rgba(16,185,129,0.2);}\n" +
            "#sw-root .sw-hdr-status{font-size:12px;font-weight:500;color:#4B5563}\n" +

            "#sw-root .sw-hdr-acts{display:flex;gap:2px;flex-shrink:0}\n" +
            "#sw-root .sw-hdr-btn{width:28px;height:28px;border-radius:6px;cursor:pointer;border:none;" +
            "background:transparent;color:#6B7280;display:flex;align-items:center;justify-content:center;transition:background 150ms}\n" +
            "#sw-root .sw-hdr-btn:hover{background:#F3F4F6;color:#111827}\n" +
            "#sw-root .sw-hdr-btn:active{transform:scale(0.95)}\n" +

                        "#sw-root .sw-menu{position:absolute;top:100%;right:14px;margin-top:3px;" +
            "background:#ffffff;" +
            "border:1px solid #E5E7EB;border-radius:8px;box-shadow:0 7px 10px -2px rgba(0,0,0,0.1),0 3px 4px -2px rgba(0,0,0,0.1);" +
            "padding:4px;min-width:100px;z-index:20;opacity:0;transform:translateY(-6px);pointer-events:none;transition:all 200ms cubic-bezier(.4,0,.2,1)}\n" +
            "#sw-root .sw-menu.sw-menu-open{opacity:1;transform:translateY(0);pointer-events:auto}\n" +
            "#sw-root .sw-menu-item{display:flex;align-items:center;gap:6px;padding:6px 8px;" +
            "border-radius:6px;font-size:11px;font-weight:500;color:#374151;" +
            "cursor:pointer;background:transparent;border:none;width:100%;transition:background 150ms;text-align:left;}\n" +
            "#sw-root .sw-menu-item:hover{background:#F3F4F6;}\n" +

                        "#sw-root .sw-messages{flex:1;padding:16px 14px 8px 14px;overflow-y:auto;overscroll-behavior:contain;" +
            "background:var(--sw-msg-bg);display:flex;flex-direction:column;gap:8px}\n" +
            "#sw-root .sw-messages::-webkit-scrollbar{width:4px}\n" +
            "#sw-root .sw-messages::-webkit-scrollbar-track{background:transparent}\n" +
            "#sw-root .sw-messages::-webkit-scrollbar-thumb{background:#D1D5DB;border-radius:4px}\n" +

                        "#sw-root .sw-row{display:flex;align-items:flex-end;gap:6px;max-width:100%}\n" +
            "#sw-root .sw-row.sw-user{justify-content:flex-end}\n" +
            "#sw-root .sw-row.sw-bot,#sw-root .sw-row.sw-system,#sw-root .sw-row.sw-source{justify-content:flex-start}\n" +
            "#sw-root .sw-row.sw-entering{animation:sw-msgIn 250ms cubic-bezier(.4,0,.2,1) both}\n" +

                        "#sw-root .sw-bubble{max-width:85%;border-radius:14px;padding:9px 12px;" +
            "font-size:12.5px;line-height:1.5;word-break:break-word;white-space:pre-wrap;box-shadow:var(--sw-sh-b)}\n" +

            "#sw-root .sw-row.sw-user .sw-bubble{background:linear-gradient(135deg, #60A5FA, #6366F1);" +
            "color:#ffffff;border-bottom-right-radius:3px;box-shadow:0 3px 9px rgba(99,102,241,0.25);}\n" +

            "#sw-root .sw-row.sw-bot .sw-bubble, #sw-root .sw-row.sw-system .sw-bubble, #sw-root .sw-row.sw-source .sw-bubble{" +
            "background:#ffffff;color:#1F2937;border-bottom-left-radius:3px;border:1.5px solid #D1D5DB;box-shadow:0 2px 8px rgba(0,0,0,0.12);}\n" +

            "#sw-root .sw-row.sw-system .sw-bubble{background:#FEF3C7;color:#92400E;border-color:#FDE68A;font-size:11px;}\n" +
            "#sw-root .sw-row.sw-source .sw-bubble{background:#EEF2FF;color:#312E81;border:1px dashed #A5B4FC;}\n" +

                        "#sw-root .sw-rich p{margin:0 0 6px}#sw-root .sw-rich p:last-child{margin-bottom:0}\n" +
            "#sw-root .sw-rich ul,#sw-root .sw-rich ol{margin:4px 0 6px 14px;padding:0}\n" +
            "#sw-root .sw-rich li{margin:0 0 3px}\n" +
            "#sw-root .sw-rich code{font-family:'JetBrains Mono','Fira Code',monospace;font-size:11px;" +
            "background:#F3F4F6;padding:1px 4px;border-radius:3px}\n" +
            "#sw-root .sw-heading{font-weight:700;color:#111827;margin-bottom:4px;}\n" +

                        "#sw-root .sw-typing{display:inline-flex;align-items:center;gap:3px;padding:3px 0}\n" +
            "#sw-root .sw-dot{width:4px;height:4px;border-radius:50%;background:#9CA3AF;" +
            "animation:sw-bounce 1.4s infinite ease-in-out both}\n" +
            "#sw-root .sw-dot:nth-child(1){animation-delay:-0.32s}\n" +
            "#sw-root .sw-dot:nth-child(2){animation-delay:-0.16s}\n" +

                        "#sw-root .sw-src-lbl{display:inline-block;margin-bottom:4px;padding:1px 6px;" +
            "border-radius:999px;font-size:9px;text-transform:uppercase;" +
            "font-weight:700;color:#4F46E5;background:#EEF2FF}\n" +
            "#sw-root .sw-src-text{font-size:11px;line-height:1.5}\n" +

                        "#sw-root .sw-chips{display:flex;flex-wrap:wrap;gap:6px;margin:3px 0 6px;padding-left:0}\n" +
            "#sw-root .sw-chip{display:inline-block;padding:5px 10px;border-radius:999px;" +
            "border:1px solid #E5E7EB;background:#ffffff;color:#4F46E5;" +
            "font-size:11px;font-weight:500;cursor:pointer;transition:all 150ms;line-height:1.2;box-shadow:0 1px 2px rgba(0,0,0,0.05);}\n" +
            "#sw-root .sw-chip:hover{background:#F9FAFB;border-color:#C7D2FE;color:#4338CA}\n" +

                        "#sw-root .sw-cards{display:flex;flex-direction:column;gap:6px;margin:6px 0 3px;" +
            "padding-left:0;max-width:85%}\n" +
            "#sw-root .sw-card{display:flex;align-items:center;justify-content:space-between;" +
            "padding:8px 12px;border-radius:8px;border:1px solid #E5E7EB;" +
            "background:#ffffff;color:#1F2937;font-size:12px;font-weight:500;" +
            "cursor:pointer;transition:all 150ms;line-height:1.3;box-shadow:0 1px 2px rgba(0,0,0,0.05);}\n" +
            "#sw-root .sw-card:hover{background:#F9FAFB;border-color:#D1D5DB;}\n" +
            "#sw-root .sw-card-chev{color:#9CA3AF;flex-shrink:0;margin-left:8px}\n" +

                        "#sw-root .sw-composer{background:#ffffff;border-top:1px solid var(--sw-border);" +
            "padding:16px 20px;display:flex;align-items:center;gap:12px;flex-shrink:0;border-bottom-left-radius:var(--sw-r-p);border-bottom-right-radius:var(--sw-r-p)}\n" +

            "#sw-root .sw-input{flex:1;min-width:0;background:#ffffff;border:1px solid #E5E7EB;" +
            "border-radius:999px;padding:12px 18px;font-size:14px;font-family:" + ff + ";" +
            "color:#1f2937;outline:none;transition:all 150ms;box-shadow:inset 0 1px 2px rgba(0,0,0,0.05);}\n" +
            "#sw-root .sw-input::placeholder{color:#9CA3AF}\n" +
            "#sw-root .sw-input:focus{border-color:#60A5FA;box-shadow:0 0 0 2px rgba(96,165,250,0.2)}\n" +

            "#sw-root .sw-send{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg, #60A5FA, #6366F1);" +
            "color:#ffffff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;" +
            "transition:all 150ms;border:none;box-shadow:0 4px 12px rgba(99,102,241,0.25);}\n" +
            "#sw-root .sw-send:hover{transform:scale(1.05);box-shadow:0 6px 16px rgba(99,102,241,0.3);}\n" +
            "#sw-root .sw-send:active{transform:scale(0.95);}\n" +
            "#sw-root .sw-send[disabled],#sw-root .sw-input[disabled]{opacity:0.6;cursor:not-allowed}\n" +
            "#sw-root .sw-send[disabled]:hover{transform:none;box-shadow:0 4px 12px rgba(99,102,241,0.25);}\n" +

                        "#sw-root .sw-launcher{width:56px;height:56px;margin-left:auto;border-radius:50%;" +
            "background:linear-gradient(135deg, #60A5FA, #6366F1);" +
            "color:#ffffff;cursor:pointer;display:flex;align-items:center;justify-content:center;" +
            "box-shadow:var(--sw-sh-l);border:none;overflow:hidden;" +
            "transition:all 200ms cubic-bezier(.4,0,.2,1);position:relative;z-index:10;}\n" +
            "#sw-root .sw-launcher:hover{transform:scale(1.05);box-shadow:0 12px 24px rgba(79,70,229,0.4);}\n" +
            "#sw-root .sw-launcher:active{transform:scale(0.95);}\n" +
            "#sw-root .sw-launcher svg{transition:all 200ms}\n" +



                        "@keyframes sw-msgIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}\n" +
            "@keyframes sw-bounce{0%,80%,100%{transform:scale(0)}40%{transform:scale(1)}}\n" +
            "@keyframes sw-pulse-dot{0%{box-shadow:0 0 0 0 rgba(16,185,129,0.4)}70%{box-shadow:0 0 0 4px rgba(16,185,129,0)}100%{box-shadow:0 0 0 0 rgba(16,185,129,0)}}\n" +
            "@keyframes sw-badgeIn{from{transform:scale(0)}to{transform:scale(1)}}\n" +

                        "#sw-root .sw-icon-chat,#sw-root .sw-icon-close{position:absolute;transition:all 300ms cubic-bezier(.4,0,.2,1);display:flex;align-items:center;justify-content:center;}\n" +
            "#sw-root .sw-icon-chat svg{width:28px;height:28px;}" +
            "#sw-root .sw-icon-close svg{width:24px;height:24px;}" +
            "#sw-root .sw-icon-close{opacity:0;transform:rotate(-90deg) scale(0)}\n" +
            "#sw-root.sw-open .sw-icon-chat{opacity:0;transform:rotate(90deg) scale(0)}\n" +
            "#sw-root.sw-open .sw-icon-close{opacity:1;transform:rotate(0deg) scale(1)}\n" +

                        "@media(max-width:480px){#sw-root{right:12px;left:auto;bottom:12px}" +
            "#sw-root .sw-panel{width:min(280px,calc(100vw - 24px));height:min(400px,78vh)}}\n" +

                        "#sw-root .sw-logo-light { display: block; }\n" +
            "#sw-root .sw-logo-dark { display: none; }\n" +

                        "#sw-root.sw-dark {\n" +
            "    --sw-text: #f9fafb; --sw-text-l: #9ca3af;\n" +
            "    --sw-bg: #1f2937; --sw-msg-bg: #111827;\n" +
            "    --sw-border: #374151; --sw-border-l: #4b5563;\n" +
            "    --sw-sh-p: 0 20px 40px -8px rgba(0,0,0,0.5);\n" +
            "    --sw-sh-b: 0 2px 8px rgba(0,0,0,0.3);\n" +
            "}\n" +
            "#sw-root.sw-dark .sw-header { background: #1f2937; border-color: #374151; }\n" +
            "#sw-root.sw-dark .sw-hdr-av { border-color: transparent; }\n" +
            "#sw-root.sw-dark .sw-hdr-name { color: #f9fafb; }\n" +
            "#sw-root.sw-dark .sw-hdr-status { color: #9ca3af; }\n" +
            "#sw-root.sw-dark .sw-logo-light { display: none !important; }\n" +
            "#sw-root.sw-dark .sw-logo-dark { display: block !important; }\n" +
            "#sw-root.sw-dark .sw-hdr-btn { color: #9ca3af; }\n" +
            "#sw-root.sw-dark .sw-hdr-btn:hover { background: #374151; color: #f9fafb; }\n" +
            "#sw-root.sw-dark .sw-menu { background: #1f2937; border-color: #374151; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3); }\n" +
            "#sw-root.sw-dark .sw-menu-item { color: #d1d5db; }\n" +
            "#sw-root.sw-dark .sw-menu-item:hover { background: #374151; }\n" +
            "#sw-root.sw-dark .sw-row.sw-bot .sw-bubble, #sw-root.sw-dark .sw-row.sw-system .sw-bubble, #sw-root.sw-dark .sw-row.sw-source .sw-bubble { background: #1f2937; color: #f9fafb; border-color: #374151; }\n" +
            "#sw-root.sw-dark .sw-row.sw-system .sw-bubble { background: #78350f; color: #fef3c7; border-color: #b45309; }\n" +
            "#sw-root.sw-dark .sw-row.sw-source .sw-bubble { background: #312e81; color: #eef2ff; border-color: #4f46e5; }\n" +
            "#sw-root.sw-dark .sw-rich code { background: #374151; color: #f3f4f6; }\n" +
            "#sw-root.sw-dark .sw-heading { color: #f9fafb; }\n" +
            "#sw-root.sw-dark .sw-dot { background: #6b7280; }\n" +
            "#sw-root.sw-dark .sw-src-lbl { background: #312e81; color: #a5b4fc; }\n" +
            "#sw-root.sw-dark .sw-chip { background: #1f2937; border-color: #4b5563; color: #818CF8; }\n" +
            "#sw-root.sw-dark .sw-chip:hover { background: #374151; border-color: #6366F1; color: #A5B4FC; }\n" +
            "#sw-root.sw-dark .sw-card { background: #1f2937; border-color: #4b5563; color: #f9fafb; }\n" +
            "#sw-root.sw-dark .sw-card:hover { background: #374151; border-color: #6b7280; }\n" +
            "#sw-root.sw-dark .sw-composer { background: #1f2937; border-color: #374151; }\n" +
            "#sw-root.sw-dark .sw-input { background: #111827; border-color: #4b5563; color: #f9fafb; }\n" +
            "#sw-root.sw-dark .sw-input:focus { border-color: #818CF8; box-shadow: 0 0 0 2px rgba(129,140,248,0.2); }\n" +
            "#sw-root .sw-hdr-dot.sw-offline { background: #ef4444; animation: none; }\n" +

                        "@media(prefers-reduced-motion:reduce){#sw-root .sw-panel,#sw-root .sw-launcher,#sw-root .sw-row.sw-entering," +
            "#sw-root .sw-dot,#sw-root .sw-badge,#sw-root .sw-icon-chat,#sw-root .sw-icon-close,#sw-root .sw-chip,#sw-root .sw-card{animation:none!important;transition:none!important}}\n"
        );
    }

        function Widget(config) {
        this.cfg = deepMerge(DEFAULTS, config || {});
        this.senderId = createSenderId();
        this.isOpen = false;
        this.inFlight = false;
        this.menuOpen = false;
        this.isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.serverOnline = null;
        this._healthInterval = null;
        this.els = {};
        this._init();
    }

        Widget.prototype._injectFont = function () {
        if (document.querySelector('link[href*="Inter"]')) return;
        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";
        document.head.appendChild(link);
    };

        Widget.prototype._injectStyles = function () {
        var style = document.createElement("style");
        style.id = "sw-styles";
        style.textContent = buildCSS(this.cfg);
        document.head.appendChild(style);
    };

    Widget.prototype._init = function () {
        this._injectFont();
        this._injectStyles();
        this._buildDOM();
        this._bindEvents();
        if (this.isDark) this.els.root.classList.add('sw-dark');
        this._appendBotMsg(this.cfg.greeting, false);
        this._showChips(this.cfg.starterPrompts);
        this._checkHealth();
        var self = this;
        this._healthInterval = setInterval(function () { self._checkHealth(); }, 15000);
    };

        Widget.prototype._buildDOM = function () {
        var self = this;
        var initial = this.cfg.botName.charAt(0).toUpperCase();

        /* root */
        var root = document.createElement("div");
        root.id = "sw-root";

        /* panel */
        var panel = document.createElement("section");
        panel.className = "sw-panel";
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-label", this.cfg.botName + " Chat");

        /* header */
        var header = document.createElement("header");
        header.className = "sw-header";

        var hdrAv = document.createElement("div");
        hdrAv.className = "sw-hdr-av";

        var logoImgLight = document.createElement("img");
        logoImgLight.className = "sw-logo-light";
        logoImgLight.src = "http://localhost:8787/sarathi-logo-dark.png";
        logoImgLight.alt = "Sarathi Logo";
        logoImgLight.style.width = "100%";
        logoImgLight.style.height = "100%";
        logoImgLight.style.objectFit = "cover";

        var logoImgDark = document.createElement("img");
        logoImgDark.className = "sw-logo-dark";
        logoImgDark.src = "http://localhost:8787/sarathi-logo.png";
        logoImgDark.alt = "Sarathi Logo";
        logoImgDark.style.width = "100%";
        logoImgDark.style.height = "100%";
        logoImgDark.style.objectFit = "cover";

        hdrAv.appendChild(logoImgLight);
        hdrAv.appendChild(logoImgDark);

        var hdrInfo = document.createElement("div");
        hdrInfo.className = "sw-hdr-info";
        var hdrName = document.createElement("div");
        hdrName.className = "sw-hdr-name";
        hdrName.textContent = this.cfg.botName;
        var hdrSub = document.createElement("div");
        hdrSub.className = "sw-hdr-sub";

        var hdrDot = document.createElement("div");
        hdrDot.className = "sw-hdr-dot";
        var hdrStatus = document.createElement("div");
        hdrStatus.className = "sw-hdr-status";
        hdrStatus.textContent = "Checking...";
        hdrSub.appendChild(hdrDot);
        hdrSub.appendChild(hdrStatus);

        hdrInfo.appendChild(hdrName);
        hdrInfo.appendChild(hdrSub);

        var hdrActs = document.createElement("div");
        hdrActs.className = "sw-hdr-acts";

        var newChatBtn = document.createElement("button");
        newChatBtn.type = "button";
        newChatBtn.className = "sw-hdr-btn";
        newChatBtn.innerHTML = ICON.newChat;
        newChatBtn.setAttribute("aria-label", "New chat");
        newChatBtn.setAttribute("title", "New chat");

        var themeBtn = document.createElement("button");
        themeBtn.type = "button";
        themeBtn.className = "sw-hdr-btn";
        themeBtn.innerHTML = this.isDark ? ICON.sun : ICON.moon;
        themeBtn.setAttribute("aria-label", "Toggle dark mode");
        themeBtn.setAttribute("title", "Toggle dark/light mode");

        hdrActs.appendChild(newChatBtn);
        hdrActs.appendChild(themeBtn);

        header.appendChild(hdrAv);
        header.appendChild(hdrInfo);
        header.appendChild(hdrActs);

        // We moved the new chat menu out of the header in this UI update, 
        // appending it to root to keep it distinct if we decide to re-add it.
        // For now, the Figma UI doesn't explicitly have the menu (...) in the header.

        /* messages */
        var messages = document.createElement("div");
        messages.className = "sw-messages";
        messages.setAttribute("role", "log");
        messages.setAttribute("aria-live", "polite");

        /* composer */
        var composer = document.createElement("form");
        composer.className = "sw-composer";
        composer.setAttribute("autocomplete", "off");

        var input = document.createElement("input");
        input.type = "text";
        input.className = "sw-input";
        input.placeholder = "Type and press [enter]";
        input.setAttribute("aria-label", "Type your message");

        var sendBtn = document.createElement("button");
        sendBtn.type = "submit";
        sendBtn.className = "sw-send";
        sendBtn.innerHTML = ICON.send;
        sendBtn.setAttribute("aria-label", "Send message");

        composer.appendChild(input);
        composer.appendChild(sendBtn);

        /* resize handle */
        var resizeHandle = document.createElement("div");
        resizeHandle.className = "sw-resize";
        resizeHandle.setAttribute("aria-label", "Resize chat");

        panel.appendChild(resizeHandle);
        panel.appendChild(header);
        panel.appendChild(messages);
        panel.appendChild(composer);

        /* launcher */
        var launcher = document.createElement("button");
        launcher.type = "button";
        launcher.className = "sw-launcher";
        launcher.setAttribute("aria-label", "Open " + this.cfg.botName + " chat");
        launcher.setAttribute("aria-expanded", "false");

        var iconChat = document.createElement("div");
        iconChat.className = "sw-icon-chat";
        var launcherLogo = document.createElement("img");
        launcherLogo.src = "http://localhost:8787/sarathi-logo.png";
        launcherLogo.alt = "Chat";
        launcherLogo.style.width = "40px";
        launcherLogo.style.height = "40px";
        launcherLogo.style.objectFit = "cover";
        iconChat.appendChild(launcherLogo);

        var iconClose = document.createElement("div");
        iconClose.className = "sw-icon-close";
        iconClose.innerHTML = ICON.close;

        launcher.appendChild(iconChat);
        launcher.appendChild(iconClose);



        root.appendChild(panel);
        root.appendChild(launcher);
        document.body.appendChild(root);

        this.els = {
            root: root,
            panel: panel,
            header: header,
            messages: messages,
            input: input,
            sendBtn: sendBtn,
            composer: composer,
            launcher: launcher,
            newChatBtn: newChatBtn,
            themeBtn: themeBtn,
            hdrDot: hdrDot,
            hdrStatus: hdrStatus,
            resizeHandle: resizeHandle,
        };
    };

        Widget.prototype._bindEvents = function () {
        var self = this;

        self.els.launcher.addEventListener("click", function () {
            self.toggle();
        });

        self.els.composer.addEventListener("submit", function (e) {
            e.preventDefault();
            self._onSubmit();
        });

        self.els.newChatBtn.addEventListener("click", function () {
            self.reset();
        });

        self.els.themeBtn.addEventListener("click", function () {
            self._toggleDark();
        });

        /* resize drag */
        (function () {
            var dragging = false, startX, startY, startW, startH;
            var MIN_W = 220, MIN_H = 300, MAX_W = 600, MAX_H = 800;

            function onDown(e) {
                e.preventDefault();
                dragging = true;
                var touch = e.touches ? e.touches[0] : e;
                startX = touch.clientX;
                startY = touch.clientY;
                var rect = self.els.panel.getBoundingClientRect();
                startW = rect.width;
                startH = rect.height;
                self.els.root.classList.add('sw-resizing');
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
                document.addEventListener('touchmove', onMove, { passive: false });
                document.addEventListener('touchend', onUp);
            }

            function onMove(e) {
                if (!dragging) return;
                var touch = e.touches ? e.touches[0] : e;
                var dx = startX - touch.clientX;
                var dy = startY - touch.clientY;
                var newW = Math.max(MIN_W, Math.min(MAX_W, startW + dx));
                var newH = Math.max(MIN_H, Math.min(MAX_H, startH + dy));
                self.els.panel.style.width = newW + 'px';
                self.els.panel.style.height = newH + 'px';
            }

            function onUp() {
                dragging = false;
                self.els.root.classList.remove('sw-resizing');
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                document.removeEventListener('touchmove', onMove);
                document.removeEventListener('touchend', onUp);
            }

            self.els.resizeHandle.addEventListener('mousedown', onDown);
            self.els.resizeHandle.addEventListener('touchstart', onDown, { passive: false });
        })();

        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape") {
                if (self.isOpen) self.close();
            }
        });
    };

        Widget.prototype.open = function () {
        this.isOpen = true;
        this.els.root.classList.add("sw-open");
        this.els.launcher.setAttribute("aria-expanded", "true");
        var self = this;
        requestAnimationFrame(function () {
            self.els.input.focus();
            self._scrollToBottom(false);
        });
    };

    Widget.prototype.close = function () {
        this.isOpen = false;
        if (this.els.menu) this._closeMenu();
        this.els.root.classList.remove("sw-open");
        this.els.launcher.setAttribute("aria-expanded", "false");
    };

    Widget.prototype.toggle = function () {
        this.isOpen ? this.close() : this.open();
    };

    Widget.prototype.reset = function () {
        this.senderId = createSenderId();
        this.els.messages.innerHTML = "";
        this._appendSystemMsg(MSG.newSession, true);
        this._appendBotMsg(this.cfg.greeting, true);
        this._showChips(this.cfg.starterPrompts);
    };

    Widget.prototype.destroy = function () {
        if (this._healthInterval) clearInterval(this._healthInterval);
        if (this.els.root && this.els.root.parentNode) {
            this.els.root.parentNode.removeChild(this.els.root);
        }
        var style = document.getElementById("sw-styles");
        if (style) style.parentNode.removeChild(style);
    };

    Widget.prototype._checkHealth = function () {
        var self = this;
        var url = this.cfg.serverUrl.replace(/\/webhooks\/.*$/, '/');
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.timeout = 5000;
        xhr.onload = function () {
            self.serverOnline = xhr.status >= 200 && xhr.status < 400;
            self._updateStatusUI();
        };
        xhr.onerror = xhr.ontimeout = function () {
            self.serverOnline = false;
            self._updateStatusUI();
        };
        xhr.send();
    };

    Widget.prototype._updateStatusUI = function () {
        if (this.serverOnline) {
            this.els.hdrDot.classList.remove('sw-offline');
            this.els.hdrStatus.textContent = 'Online';
        } else {
            this.els.hdrDot.classList.add('sw-offline');
            this.els.hdrStatus.textContent = 'Offline';
        }
    };

    Widget.prototype._toggleDark = function () {
        this.isDark = !this.isDark;
        this.els.root.classList.toggle('sw-dark', this.isDark);
        this.els.themeBtn.innerHTML = this.isDark ? ICON.sun : ICON.moon;
    };

        Widget.prototype._toggleMenu = function () {
        this.menuOpen = !this.menuOpen;
        this.els.menu.classList.toggle("sw-menu-open", this.menuOpen);
    };

    Widget.prototype._closeMenu = function () {
        this.menuOpen = false;
        this.els.menu.classList.remove("sw-menu-open");
    };

        Widget.prototype._scrollToBottom = function (smooth) {
        var el = this.els.messages;
        if (!el) return;
        if (smooth && typeof el.scrollTo === "function")
            el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        else el.scrollTop = el.scrollHeight;
    };



    Widget.prototype._appendUserMsg = function (text, animate) {
        var row = document.createElement("div");
        row.className = "sw-row sw-user" + (animate ? " sw-entering" : "");
        var bubble = document.createElement("div");
        bubble.className = "sw-bubble";
        bubble.textContent = text;
        row.appendChild(bubble);
        this.els.messages.appendChild(row);
        this._scrollToBottom(true);
        return row;
    };

        Widget.prototype._appendBotMsg = function (text, animate) {
        var row = document.createElement("div");
        row.className = "sw-row sw-bot" + (animate ? " sw-entering" : "");
        var bubble = document.createElement("div");
        bubble.className = "sw-bubble sw-rich";
        bubble.innerHTML = fmtRich(text);
        row.appendChild(bubble);
        this.els.messages.appendChild(row);
        this._scrollToBottom(true);
        return row;
    };

    Widget.prototype._appendSystemMsg = function (text, animate) {
        var row = document.createElement("div");
        row.className = "sw-row sw-system" + (animate ? " sw-entering" : "");
        var bubble = document.createElement("div");
        bubble.className = "sw-bubble";
        bubble.textContent = text;
        row.appendChild(bubble);
        this.els.messages.appendChild(row);
        this._scrollToBottom(true);
        return row;
    };

    Widget.prototype._appendSourceBubble = function (sourceText, animate) {
        var row = document.createElement("div");
        row.className = "sw-row sw-source" + (animate ? " sw-entering" : "");
        var bubble = document.createElement("div");
        bubble.className = "sw-bubble";
        var lbl = document.createElement("div");
        lbl.className = "sw-src-lbl";
        lbl.textContent = "Sources";
        var txt = document.createElement("div");
        txt.className = "sw-src-text sw-rich";
        txt.innerHTML = fmtRich(sourceText);
        bubble.appendChild(lbl);
        bubble.appendChild(txt);
        row.appendChild(bubble);
        this.els.messages.appendChild(row);
        this._scrollToBottom(true);
    };

    Widget.prototype._appendTyping = function () {
        var row = document.createElement("div");
        row.className = "sw-row sw-bot sw-entering";
        var bubble = document.createElement("div");
        bubble.className = "sw-bubble";
        bubble.setAttribute("aria-label", MSG.thinking);
        var wrap = document.createElement("span");
        wrap.className = "sw-typing";
        for (var i = 0; i < 3; i++) {
            var dot = document.createElement("span");
            dot.className = "sw-dot";
            wrap.appendChild(dot);
        }
        bubble.appendChild(wrap);
        row.appendChild(bubble);
        this.els.messages.appendChild(row);
        this._scrollToBottom(true);
        return row;
    };

    Widget.prototype._appendImage = function (url) {
        var row = document.createElement("div");
        row.className = "sw-row sw-bot sw-entering";
        var img = document.createElement("img");
        img.style.cssText =
            "max-width:82%;border-radius:var(--sw-r-c);border:1px solid var(--sw-border)";
        img.alt = "Bot attachment";
        img.loading = "lazy";
        img.src = url;
        row.appendChild(img);
        this.els.messages.appendChild(row);
        this._scrollToBottom(true);
    };

        Widget.prototype._showChips = function (prompts) {
        if (!Array.isArray(prompts) || prompts.length === 0) return;
        var self = this;
        var wrap = document.createElement("div");
        wrap.className = "sw-chips";
        prompts.forEach(function (prompt) {
            var chip = document.createElement("button");
            chip.type = "button";
            chip.className = "sw-chip";
            chip.textContent = prompt;
            chip.addEventListener("click", function () {
                if (self.inFlight) return;
                self.els.input.value = prompt;
                self._onSubmit();
            });
            wrap.appendChild(chip);
        });
        this.els.messages.appendChild(wrap);
        this._scrollToBottom(true);
    };

        Widget.prototype._showCards = function (buttons) {
        if (!Array.isArray(buttons) || buttons.length === 0) return;
        var self = this;
        var wrap = document.createElement("div");
        wrap.className = "sw-cards";
        buttons.forEach(function (btn) {
            var title =
                typeof btn.title === "string" ? btn.title.trim() : "";
            var payload =
                typeof btn.payload === "string" ? btn.payload.trim() : title;
            if (!title || !payload) return;
            var card = document.createElement("button");
            card.type = "button";
            card.className = "sw-card";
            var label = document.createElement("span");
            label.textContent = title;
            var chev = document.createElement("span");
            chev.className = "sw-card-chev";
            chev.innerHTML = ICON.chevron;
            card.appendChild(label);
            card.appendChild(chev);
            card.addEventListener("click", function () {
                if (self.inFlight) return;
                self.els.input.value = payload;
                self._onSubmit();
            });
            wrap.appendChild(card);
        });
        if (wrap.childNodes.length > 0) {
            this.els.messages.appendChild(wrap);
            this._scrollToBottom(true);
        }
    };

        Widget.prototype._setLoading = function (loading) {
        this.inFlight = loading;
        this.els.input.disabled = loading;
        this.els.sendBtn.disabled = loading;
    };

        Widget.prototype._onSubmit = function () {
        if (this.inFlight) return;
        var text = this.els.input.value.trim();
        if (!text) return;

        this._appendUserMsg(text, true);
        this.els.input.value = "";
        this._setLoading(true);
        var typingRow = this._appendTyping();
        var self = this;

        this._callRasa(text)
            .then(function (msgs) {
                self._removeEl(typingRow);
                self._renderRasa(msgs);
            })
            .catch(function (err) {
                self._removeEl(typingRow);
                if (err && err.name === "AbortError")
                    self._appendSystemMsg(MSG.timeout, true);
                else self._appendSystemMsg(MSG.error, true);
                if (window.console) console.error("Sarathi widget error:", err);
            })
            .finally(function () {
                self._setLoading(false);
                self.els.input.focus();
            });
    };

    Widget.prototype._removeEl = function (el) {
        if (el && el.parentNode) el.parentNode.removeChild(el);
    };

        Widget.prototype._callRasa = function (text) {
        var self = this;
        var payload = {
            sender: this.senderId,
            message: text,
            metadata: {
                language: this.cfg.language,
                source: "website_widget",
            },
        };

        var useTimeout = this.cfg.requestTimeoutMs > 0;
        var controller =
            useTimeout && typeof AbortController !== "undefined"
                ? new AbortController()
                : null;
        var tid = null;
        if (controller) {
            tid = window.setTimeout(function () {
                controller.abort();
            }, self.cfg.requestTimeoutMs);
        }

        return fetch(this.cfg.serverUrl, {
            method: "POST",
            cache: "no-store",
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-store",
            },
            body: JSON.stringify(payload),
            signal: controller ? controller.signal : undefined,
        })
            .then(function (res) {
                if (!res.ok) throw new Error("HTTP " + res.status);
                return res.json();
            })
            .finally(function () {
                if (tid !== null) window.clearTimeout(tid);
            });
    };

        Widget.prototype._renderRasa = function (messages) {
        if (!Array.isArray(messages) || messages.length === 0) {
            this._appendSystemMsg(MSG.empty, true);
            return;
        }
        var self = this;
        messages.forEach(function (msg) {
            if (msg && typeof msg.text === "string" && msg.text.trim()) {
                var parts = splitSources(msg.text.trim());
                if (parts.answer) self._appendBotMsg(parts.answer, true);
                if (parts.source)
                    self._appendSourceBubble(parts.source, true);
            }
            if (msg && typeof msg.image === "string" && msg.image.trim())
                self._appendImage(msg.image.trim());
            if (
                msg &&
                Array.isArray(msg.buttons) &&
                msg.buttons.length > 0
            )
                self._showCards(msg.buttons);
        });
    };

        window.SarathiWidget = {
        /** Initialize the chat widget with given configuration */
        init: function (config) {
            var instance = new Widget(config);
            return {
                open: function () {
                    instance.open();
                },
                close: function () {
                    instance.close();
                },
                toggle: function () {
                    instance.toggle();
                },
                reset: function () {
                    instance.reset();
                },
                destroy: function () {
                    instance.destroy();
                },
            };
        },
        version: "2.0.0-beta",
    };

        (function autoInit() {
        var scripts = document.querySelectorAll(
            'script[src*="sarathi-widget"]'
        );
        var tag = scripts.length > 0 ? scripts[scripts.length - 1] : null;
        if (tag && tag.dataset && tag.dataset.autoInit !== undefined) {
            var autoConfig = {};
            if (tag.dataset.serverUrl) autoConfig.serverUrl = tag.dataset.serverUrl;
            if (tag.dataset.botName) autoConfig.botName = tag.dataset.botName;
            if (tag.dataset.subtitle) autoConfig.subtitle = tag.dataset.subtitle;
            if (document.readyState === "loading") {
                document.addEventListener("DOMContentLoaded", function () {
                    window.SarathiWidget.init(autoConfig);
                });
            } else {
                window.SarathiWidget.init(autoConfig);
            }
        }
    })();
})();
