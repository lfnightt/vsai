// ============================================================================
// Projects System — sidebar button, dropdown, create modal, project view,
// workspace panel, file CRUD, file editor, and localStorage.
// ============================================================================
(function () {
    'use strict';

    // ── Constants ──────────────────────────────────────────────────────────
    var STORAGE_KEY = 'ox_projects';
    var ACTIVE_PROJECT_KEY = 'ox_active_project';

    // ── Helpers ────────────────────────────────────────────────────────────
    function loadProjects() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') || [];
        } catch (e) { return []; }
    }

    function saveProjects(arr) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); } catch (e) {}
    }

    function getActiveProjectId() {
        try { return localStorage.getItem(ACTIVE_PROJECT_KEY) || null; } catch (e) { return null; }
    }

    function setActiveProjectId(id) {
        try {
            if (id) localStorage.setItem(ACTIVE_PROJECT_KEY, id);
            else localStorage.removeItem(ACTIVE_PROJECT_KEY);
        } catch (e) {}
    }

    function getActiveProject() {
        var id = getActiveProjectId();
        if (!id) return null;
        var projects = loadProjects();
        for (var i = 0; i < projects.length; i++) {
            if (projects[i].id === id) return projects[i];
        }
        return null;
    }

    function svg(d) {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    function formatDate(iso) {
        if (!iso) return '—';
        var d = new Date(iso);
        var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
    }

    function fileIcon(name) {
        var ext = (name || '').split('.').pop().toLowerCase();
        var map = {
            html: '🌐', htm: '🌐', css: '🎨', js: '⚡', jsx: '⚛️', ts: '🔷', tsx: '⚛️',
            json: '📋', py: '🐍', rb: '💎', go: '🔷', rs: '🦀', java: '☕', c: '🔧',
            cpp: '🔧', h: '🔧', php: '🐘', sql: '🗄️', md: '📝', txt: '📄',
            svg: '🖼️', png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️',
            xml: '📰', yaml: '⚙️', yml: '⚙️', toml: '⚙️', sh: '🖥️', bash: '🖥️',
            env: '🔒', gitignore: '🔒', dockerfile: '🐳', makefile: '🔨'
        };
        return map[ext] || '📄';
    }

    // ── State ──────────────────────────────────────────────────────────────
    var dropdownOpen = false;
    var workspacePanelOpen = false;

    // ── File CRUD ──────────────────────────────────────────────────────────

    function addFile(projectId, file) {
        var projects = loadProjects();
        for (var i = 0; i < projects.length; i++) {
            if (projects[i].id === projectId) {
                if (!projects[i].files) projects[i].files = [];
                for (var j = 0; j < projects[i].files.length; j++) {
                    if (projects[i].files[j].name === file.name) return null;
                }
                var entry = {
                    name: file.name,
                    content: file.content || '',
                    type: file.type || 'file',
                    createdAt: new Date().toISOString()
                };
                projects[i].files.push(entry);
                projects[i].updatedAt = new Date().toISOString();
                saveProjects(projects);
                return entry;
            }
        }
        return null;
    }

    function deleteFile(projectId, fileName) {
        var projects = loadProjects();
        for (var i = 0; i < projects.length; i++) {
            if (projects[i].id === projectId) {
                var before = (projects[i].files || []).length;
                projects[i].files = (projects[i].files || []).filter(function(f) { return f.name !== fileName; });
                if (projects[i].files.length < before) {
                    projects[i].updatedAt = new Date().toISOString();
                    saveProjects(projects);
                    return true;
                }
            }
        }
        return false;
    }

    function getFile(projectId, fileName) {
        var projects = loadProjects();
        for (var i = 0; i < projects.length; i++) {
            if (projects[i].id === projectId && projects[i].files) {
                for (var j = 0; j < projects[i].files.length; j++) {
                    if (projects[i].files[j].name === fileName) return projects[i].files[j];
                }
            }
        }
        return null;
    }

    function updateFile(projectId, fileName, content) {
        var projects = loadProjects();
        for (var i = 0; i < projects.length; i++) {
            if (projects[i].id === projectId) {
                for (var j = 0; j < (projects[i].files || []).length; j++) {
                    if (projects[i].files[j].name === fileName) {
                        projects[i].files[j].content = content;
                        projects[i].updatedAt = new Date().toISOString();
                        saveProjects(projects);
                        return true;
                    }
                }
            }
        }
        return false;
    }

    // ── Toast ──────────────────────────────────────────────────────────────
    function showToast(msg) {
        var existing = document.querySelector('.ox-toast');
        if (existing) existing.remove();
        var t = document.createElement('div');
        t.className = 'ox-toast';
        t.textContent = msg;
        document.body.appendChild(t);
        requestAnimationFrame(function () { t.classList.add('show'); });
        setTimeout(function () {
            t.classList.remove('show');
            setTimeout(function () { if (t.parentNode) t.remove(); }, 300);
        }, 2000);
    }

    // ── Updates Button (moved from chat-features.js) ───────────────────────
    function injectUpdatesButton() {
        var sidebar = document.querySelector('.sidebar');
        if (!sidebar) return false;

        var chatList = sidebar.querySelector('[class*="chat-list"], ul, ol, .sidebar-chats') ||
                       sidebar.querySelector('.sidebar > div:last-child') ||
                       sidebar.querySelector('.sidebar > div > div:last-child');
        if (!chatList) return false;

        if (chatList.querySelector('.ox-updates-btn-item')) return true;

        var item = document.createElement('li');
        item.className = 'ox-updates-btn-item chat-item';
        item.style.cssText = 'list-style:none;margin:0;padding:0;';

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ox-updates-btn chat-item-btn';
        btn.setAttribute('aria-label', 'Updates');
        btn.title = 'Updates';
        btn.style.cssText = 'width:100%;background:transparent;border:none;padding:12px 14px;cursor:pointer;color:var(--text-primary,#e4e4e7);border-radius:10px;transition:background 0.15s,color 0.15s;display:flex;align-items:center;gap:12px;font-size:14px;font-weight:500;font-family:inherit;text-align:left;outline:none;';
        btn.innerHTML = '<svg class="chat-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;flex-shrink:0;color:var(--text-muted,#a1a1aa);"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg><span class="chat-item-title" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Updates</span>';

        btn.addEventListener('mouseenter', function () {
            this.style.background = 'var(--bg-hover,rgba(110,86,207,0.08))';
            this.style.color = 'var(--text-primary,#fff)';
            this.querySelector('.chat-item-icon').style.color = 'var(--accent,#6e56cf)';
        });
        btn.addEventListener('mouseleave', function () {
            this.style.background = 'transparent';
            this.style.color = 'var(--text-primary,#e4e4e7)';
            this.querySelector('.chat-item-icon').style.color = 'var(--text-muted,#a1a1aa)';
        });
        btn.addEventListener('mousedown', function () {
            this.style.background = 'var(--bg-active,rgba(110,86,207,0.12))';
        });
        btn.addEventListener('mouseup', function () {
            this.style.background = 'var(--bg-hover,rgba(110,86,207,0.08))';
        });
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = '/pages/updates';
        });

        item.appendChild(btn);
        chatList.prepend(item);
        return true;
    }

    // ── Sidebar Button + Dropdown ──────────────────────────────────────────
    function injectProjectsButton() {
        var sidebar = document.querySelector('.sidebar');
        if (!sidebar) return false;

        var chatList = sidebar.querySelector('[class*="chat-list"], ul, ol, .sidebar-chats') ||
                       sidebar.querySelector('.sidebar > div:last-child') ||
                       sidebar.querySelector('.sidebar > div > div:last-child');
        if (!chatList) return false;

        if (chatList.querySelector('.ox-projects-btn-item')) return true;

        var item = document.createElement('li');
        item.className = 'ox-projects-btn-item chat-item';
        item.style.cssText = 'list-style:none;margin:0;padding:0;position:relative;';

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ox-projects-btn chat-item-btn';
        btn.setAttribute('aria-label', 'Projects');
        btn.title = 'Projects';
        btn.style.cssText = 'width:100%;background:transparent;border:none;padding:12px 14px;cursor:pointer;color:var(--text-primary,#e4e4e7);border-radius:10px;transition:background 0.15s,color 0.15s;display:flex;align-items:center;gap:12px;font-size:14px;font-weight:500;font-family:inherit;text-align:left;outline:none;';

        var PROJECT_ICON = '<svg class="chat-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;flex-shrink:0;color:var(--text-muted,#a1a1aa);"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
        var CHEVRON = '<svg class="ox-projects-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;flex-shrink:0;color:var(--text-muted,#a1a1aa);transition:transform 0.2s;margin-left:auto;"><polyline points="6 9 12 15 18 9"/></svg>';
        btn.innerHTML = PROJECT_ICON + '<span class="chat-item-title" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Projects</span>' + CHEVRON;

        btn.addEventListener('mouseenter', function () {
            this.style.background = 'var(--bg-hover,rgba(110,86,207,0.08))';
            this.style.color = 'var(--text-primary,#fff)';
            this.querySelector('.chat-item-icon').style.color = 'var(--accent,#6e56cf)';
        });
        btn.addEventListener('mouseleave', function () {
            this.style.background = 'transparent';
            this.style.color = 'var(--text-primary,#e4e4e7)';
            this.querySelector('.chat-item-icon').style.color = 'var(--text-muted,#a1a1aa)';
        });
        btn.addEventListener('mousedown', function () {
            this.style.background = 'var(--bg-active,rgba(110,86,207,0.12))';
        });
        btn.addEventListener('mouseup', function () {
            this.style.background = 'var(--bg-hover,rgba(110,86,207,0.08))';
        });

        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            toggleDropdown();
        });

        item.appendChild(btn);

        var dropdown = document.createElement('div');
        dropdown.className = 'ox-projects-dropdown';
        dropdown.style.cssText = 'overflow:hidden;max-height:0;transition:max-height 0.3s ease, opacity 0.2s ease;opacity:0;';

        var list = document.createElement('ul');
        list.className = 'ox-projects-list';
        list.style.cssText = 'list-style:none;margin:0;padding:4px 10px 8px;display:flex;flex-direction:column;gap:2px;';
        dropdown.appendChild(list);

        var newBtn = document.createElement('li');
        newBtn.className = 'ox-new-project-item chat-item';
        newBtn.style.cssText = 'list-style:none;margin:0;padding:0;';
        var newBtnInner = document.createElement('button');
        newBtnInner.type = 'button';
        newBtnInner.className = 'ox-new-project-btn chat-item-btn';
        newBtnInner.setAttribute('aria-label', 'New Project');
        newBtnInner.style.cssText = 'width:100%;background:transparent;border:none;padding:10px 12px;cursor:pointer;color:var(--text-primary,#e4e4e7);border-radius:10px;transition:background 0.15s,color 0.15s;display:flex;align-items:center;gap:12px;font-size:13px;font-weight:500;font-family:inherit;text-align:left;outline:none;';
        var PLUS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;flex-shrink:0;color:var(--text-muted,#a1a1aa);"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
        newBtnInner.innerHTML = PLUS_ICON + '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">New Project</span>';

        newBtnInner.addEventListener('mouseenter', function () {
            this.style.background = 'var(--bg-hover,rgba(110,86,207,0.08))';
            this.querySelector('svg').style.color = 'var(--accent,#6e56cf)';
        });
        newBtnInner.addEventListener('mouseleave', function () {
            this.style.background = 'transparent';
            this.querySelector('svg').style.color = 'var(--text-muted,#a1a1aa)';
        });
        newBtnInner.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            openCreateModal();
        });

        newBtn.appendChild(newBtnInner);
        dropdown.appendChild(newBtn);

        item.appendChild(dropdown);

        var updatesItem = chatList.querySelector('.ox-updates-btn-item');
        if (updatesItem && updatesItem.nextSibling) {
            chatList.insertBefore(item, updatesItem.nextSibling);
        } else {
            chatList.prepend(item);
        }

        return true;
    }

    function toggleDropdown() {
        var dropdown = document.querySelector('.ox-projects-dropdown');
        var chevron = document.querySelector('.ox-projects-chevron');
        if (!dropdown) return;

        dropdownOpen = !dropdownOpen;

        if (dropdownOpen) {
            renderProjectList();
            dropdown.style.maxHeight = '400px';
            dropdown.style.opacity = '1';
            if (chevron) chevron.style.transform = 'rotate(180deg)';
        } else {
            dropdown.style.maxHeight = '0';
            dropdown.style.opacity = '0';
            if (chevron) chevron.style.transform = 'rotate(0deg)';
        }
    }

    function renderProjectList() {
        var list = document.querySelector('.ox-projects-list');
        if (!list) return;

        var projects = loadProjects();
        list.innerHTML = '';

        if (projects.length === 0) {
            var empty = document.createElement('li');
            empty.style.cssText = 'list-style:none;padding:12px;font-size:12px;color:var(--text-muted,#a1a1aa);text-align:center;';
            empty.textContent = 'No projects yet';
            list.appendChild(empty);
            return;
        }

        var activeId = getActiveProjectId();

        projects.forEach(function (proj) {
            var li = document.createElement('li');
            li.className = 'ox-project-item chat-item';
            li.style.cssText = 'list-style:none;margin:0;padding:0;position:relative;';

            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ox-project-item-btn chat-item-btn';
            btn.style.cssText = 'width:100%;background:transparent;border:none;padding:9px 12px;cursor:pointer;color:var(--text-primary,#e4e4e7);border-radius:10px;transition:background 0.15s;color 0.15s;display:flex;align-items:center;gap:12px;font-size:13px;font-weight:500;font-family:inherit;text-align:left;outline:none;' + (proj.id === activeId ? 'background:var(--surface);box-shadow:inset 0 0 0 1px var(--border);' : '');

            var nameSpan = document.createElement('span');
            nameSpan.className = 'chat-item-title';
            nameSpan.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            nameSpan.textContent = proj.name;

            var delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'ox-project-del-btn chat-item-delete';
            delBtn.setAttribute('aria-label', 'Delete project');
            delBtn.textContent = '×';
            delBtn.style.cssText = 'opacity:0;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;color:var(--text-muted);border-radius:8px;transition:all 0.12s;flex-shrink:0;background:transparent;border:1px solid transparent;';

            btn.appendChild(nameSpan);
            btn.appendChild(delBtn);

            btn.addEventListener('mouseenter', function () {
                if (proj.id !== activeId) { this.style.background = 'var(--bg-hover,rgba(110,86,207,0.08))'; }
                delBtn.style.opacity = '1';
            });
            btn.addEventListener('mouseleave', function () {
                if (proj.id !== activeId) { this.style.background = 'transparent'; }
                delBtn.style.opacity = '0';
            });

            btn.addEventListener('click', function (e) {
                if (e.target === delBtn || delBtn.contains(e.target)) return;
                e.preventDefault();
                e.stopPropagation();
                enterProject(proj.id);
            });

            delBtn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                deleteProjectConfirm(proj.id, proj.name);
            });

            li.appendChild(btn);
            list.appendChild(li);
        });
    }

    // ── CRUD ───────────────────────────────────────────────────────────────
    function createProject(name) {
        var projects = loadProjects();
        var proj = {
            id: 'proj_' + Date.now(),
            name: name.trim(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            files: []
        };
        projects.push(proj);
        saveProjects(projects);
        enterProject(proj.id);
        return proj;
    }

    function deleteProject(id) {
        var projects = loadProjects();
        projects = projects.filter(function (p) { return p.id !== id; });
        saveProjects(projects);
        if (getActiveProjectId() === id) {
            exitProject();
        }
        renderProjectList();
    }

    function deleteProjectConfirm(id, name) {
        if (document.querySelector('.ox-confirm-overlay')) return;

        var overlay = document.createElement('div');
        overlay.className = 'ox-confirm-overlay';
        overlay.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:600;align-items:center;justify-content:center;animation:oxFadeIn 0.2s ease;';

        var modal = document.createElement('div');
        modal.style.cssText = 'background:var(--bg);border:1px solid var(--border);border-radius:16px;width:380px;max-width:calc(100vw - 32px);overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.4);animation:oxSlideUp 0.25s cubic-bezier(0.2,0.65,0.2,1);';

        var header = document.createElement('div');
        header.style.cssText = 'padding:20px 24px 12px;';
        header.innerHTML = '<h3 style="font-size:15px;font-weight:600;margin:0;color:var(--text-primary);">Delete Project</h3>';

        var body = document.createElement('div');
        body.style.cssText = 'padding:0 24px 20px;';
        var msg = document.createElement('p');
        msg.style.cssText = 'font-size:13px;color:var(--text-secondary);line-height:1.5;margin:0;';
        msg.textContent = 'Are you sure you want to delete "' + name + '"? This cannot be undone and all project files will be lost.';
        body.appendChild(msg);

        var footer = document.createElement('div');
        footer.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;padding:16px 24px;border-top:1px solid var(--border);';

        var cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = 'padding:8px 16px;border-radius:10px;font-size:13px;font-weight:500;color:var(--text-secondary);border:1px solid var(--border);transition:all 0.12s;background:none;cursor:pointer;font-family:inherit;';
        cancelBtn.addEventListener('mouseenter', function () { this.style.background = 'var(--surface-hover)'; this.style.color = 'var(--text-primary)'; });
        cancelBtn.addEventListener('mouseleave', function () { this.style.background = 'transparent'; this.style.color = 'var(--text-secondary)'; });
        cancelBtn.addEventListener('click', function () { overlay.remove(); });

        var delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.textContent = 'Delete';
        delBtn.style.cssText = 'padding:8px 20px;border-radius:10px;font-size:13px;font-weight:600;color:#fff;background:var(--danger,#c05050);border:none;transition:all 0.12s;cursor:pointer;font-family:inherit;';
        delBtn.addEventListener('mouseenter', function () { this.style.filter = 'brightness(1.1)'; });
        delBtn.addEventListener('mouseleave', function () { this.style.filter = ''; });
        delBtn.addEventListener('click', function () { overlay.remove(); deleteProject(id); });

        footer.appendChild(cancelBtn);
        footer.appendChild(delBtn);
        modal.appendChild(header);
        modal.appendChild(body);
        modal.appendChild(footer);
        overlay.appendChild(modal);
        overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
    }

    function enterProject(id) {
        setActiveProjectId(id);
        dropdownOpen = false;
        var dropdown = document.querySelector('.ox-projects-dropdown');
        var chevron = document.querySelector('.ox-projects-chevron');
        if (dropdown) { dropdown.style.maxHeight = '0'; dropdown.style.opacity = '0'; }
        if (chevron) chevron.style.transform = 'rotate(0deg)';
        updateProjectView();
    }

    function exitProject() {
        setActiveProjectId(null);
        updateProjectView();
        closeWorkspacePanel();
    }

    // ── Project View ───────────────────────────────────────────────────────
    function updateProjectView() {
        var proj = getActiveProject();

        var titleEl = document.querySelector('.empty-title');
        if (titleEl) {
            if (proj) {
                titleEl.textContent = proj.name;
                titleEl.setAttribute('data-ox-project', 'true');
            } else if (titleEl.getAttribute('data-ox-project')) {
                titleEl.textContent = 'What can I help you with?';
                titleEl.removeAttribute('data-ox-project');
            }
        }

        var existingBtn = document.querySelector('.ox-workspace-menu-btn');
        var chatArea = document.querySelector('.chat-area');

        if (proj) {
            if (!existingBtn && chatArea) {
                var wsBtn = document.createElement('button');
                wsBtn.type = 'button';
                wsBtn.className = 'ox-workspace-menu-btn';
                wsBtn.setAttribute('aria-label', 'Open workspace');
                wsBtn.style.cssText = 'position:absolute;top:12px;right:12px;z-index:10;width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);background:var(--surface-solid,#1d1d21);border:1px solid var(--border,rgba(255,255,255,0.06));cursor:pointer;transition:background 0.15s,color 0.15s,transform 0.15s;box-shadow:0 2px 8px rgba(0,0,0,0.2);';
                wsBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>';
                wsBtn.addEventListener('mouseenter', function () {
                    this.style.background = 'var(--surface-hover)';
                    this.style.color = 'var(--text-primary)';
                    this.style.transform = 'scale(1.05)';
                });
                wsBtn.addEventListener('mouseleave', function () {
                    this.style.background = 'var(--surface-solid,#1d1d21)';
                    this.style.color = 'var(--text-muted)';
                    this.style.transform = 'scale(1)';
                });
                wsBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    openWorkspacePanel();
                });
                chatArea.style.position = 'relative';
                chatArea.appendChild(wsBtn);
            }
        } else {
            if (existingBtn) existingBtn.remove();
        }
    }

    // ── Create Project Modal ───────────────────────────────────────────────
    function openCreateModal() {
        if (document.querySelector('.ox-create-modal-overlay')) return;

        var overlay = document.createElement('div');
        overlay.className = 'ox-create-modal-overlay';
        overlay.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:500;align-items:center;justify-content:center;animation:oxFadeIn 0.2s ease;';

        var modal = document.createElement('div');
        modal.className = 'ox-create-modal';
        modal.style.cssText = 'background:var(--bg);border:1px solid var(--border);border-radius:20px;width:420px;max-width:calc(100vw - 32px);overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.4);animation:oxSlideUp 0.25s cubic-bezier(0.2,0.65,0.2,1);';

        var header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:20px 24px;border-bottom:1px solid var(--border);';
        var h3 = document.createElement('h3');
        h3.style.cssText = 'font-size:15px;font-weight:600;letter-spacing:-0.01em;margin:0;';
        h3.textContent = 'Create New Project';
        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.style.cssText = 'width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);transition:all 0.12s;background:none;border:none;cursor:pointer;';
        closeBtn.innerHTML = svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>');
        closeBtn.querySelector('svg').style.cssText = 'width:18px;height:18px;';
        closeBtn.addEventListener('mouseenter', function () { this.style.background = 'var(--surface-hover)'; this.style.color = 'var(--text-primary)'; });
        closeBtn.addEventListener('mouseleave', function () { this.style.background = 'transparent'; this.style.color = 'var(--text-muted)'; });
        closeBtn.addEventListener('click', function () { closeModal(); });
        header.appendChild(h3);
        header.appendChild(closeBtn);

        var body = document.createElement('div');
        body.style.cssText = 'padding:20px 24px;';
        var label = document.createElement('label');
        label.style.cssText = 'display:block;font-size:13px;font-weight:500;color:var(--text-secondary);margin-bottom:8px;';
        label.textContent = 'Project Name';
        var input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'e.g. My Awesome Project';
        input.style.cssText = 'width:100%;padding:10px 14px;border-radius:10px;font-size:14px;font-family:inherit;color:var(--text-primary);background:var(--surface);border:1px solid var(--border);transition:border-color 0.15s, box-shadow 0.15s;outline:none;box-sizing:border-box;';
        input.addEventListener('focus', function () { this.style.borderColor = 'var(--accent,#7c66e6)'; this.style.boxShadow = '0 0 0 3px rgba(124,102,230,0.15)'; });
        input.addEventListener('blur', function () { this.style.borderColor = 'var(--border)'; this.style.boxShadow = 'none'; });
        body.appendChild(label);
        body.appendChild(input);

        var footer = document.createElement('div');
        footer.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;padding:16px 24px;border-top:1px solid var(--border);';

        var cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = 'padding:8px 16px;border-radius:10px;font-size:13px;font-weight:500;color:var(--text-secondary);border:1px solid var(--border);transition:all 0.12s;background:none;cursor:pointer;font-family:inherit;';
        cancelBtn.addEventListener('mouseenter', function () { this.style.background = 'var(--surface-hover)'; this.style.color = 'var(--text-primary)'; });
        cancelBtn.addEventListener('mouseleave', function () { this.style.background = 'transparent'; this.style.color = 'var(--text-secondary)'; });
        cancelBtn.addEventListener('click', function () { closeModal(); });

        var createBtn = document.createElement('button');
        createBtn.type = 'button';
        createBtn.textContent = 'Create';
        createBtn.style.cssText = 'padding:8px 20px;border-radius:10px;font-size:13px;font-weight:600;color:#fff;background:var(--brand,#7c66e6);border:none;transition:all 0.12s;cursor:pointer;font-family:inherit;box-shadow:0 4px 12px -4px rgba(110,86,207,0.5);';
        createBtn.addEventListener('mouseenter', function () { this.style.filter = 'brightness(1.1)'; this.style.transform = 'translateY(-1px)'; });
        createBtn.addEventListener('mouseleave', function () { this.style.filter = ''; this.style.transform = ''; });
        createBtn.addEventListener('click', function () {
            var name = input.value.trim();
            if (!name) { input.focus(); return; }
            createProject(name);
            closeModal();
        });

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); var n = input.value.trim(); if (n) { createProject(n); closeModal(); } }
            if (e.key === 'Escape') closeModal();
        });

        footer.appendChild(cancelBtn);
        footer.appendChild(createBtn);
        modal.appendChild(header);
        modal.appendChild(body);
        modal.appendChild(footer);
        overlay.appendChild(modal);
        overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
        document.body.appendChild(overlay);
        setTimeout(function () { input.focus(); }, 100);
    }

    function closeModal() {
        var overlay = document.querySelector('.ox-create-modal-overlay');
        if (overlay) overlay.remove();
    }

    // ── Create File Modal ──────────────────────────────────────────────────
    function openCreateFileModal() {
        if (document.querySelector('.ox-create-file-modal-overlay')) return;
        var proj = getActiveProject();
        if (!proj) return;

        var overlay = document.createElement('div');
        overlay.className = 'ox-create-file-modal-overlay';
        overlay.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:550;align-items:center;justify-content:center;animation:oxFadeIn 0.2s ease;';

        var modal = document.createElement('div');
        modal.style.cssText = 'background:var(--bg);border:1px solid var(--border);border-radius:20px;width:440px;max-width:calc(100vw - 32px);overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.4);animation:oxSlideUp 0.25s cubic-bezier(0.2,0.65,0.2,1);';

        var header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:20px 24px;border-bottom:1px solid var(--border);';
        var h3 = document.createElement('h3');
        h3.style.cssText = 'font-size:15px;font-weight:600;letter-spacing:-0.01em;margin:0;';
        h3.textContent = 'New File';
        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.style.cssText = 'width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);transition:all 0.12s;background:none;border:none;cursor:pointer;';
        closeBtn.innerHTML = svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>');
        closeBtn.querySelector('svg').style.cssText = 'width:18px;height:18px;';
        closeBtn.addEventListener('click', function () { closeCreateFileModal(); });
        header.appendChild(h3);
        header.appendChild(closeBtn);

        var body = document.createElement('div');
        body.style.cssText = 'padding:20px 24px;';

        var nameLabel = document.createElement('label');
        nameLabel.style.cssText = 'display:block;font-size:13px;font-weight:500;color:var(--text-secondary);margin-bottom:8px;';
        nameLabel.textContent = 'File Name';
        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.placeholder = 'e.g. index.html';
        nameInput.style.cssText = 'width:100%;padding:10px 14px;border-radius:10px;font-size:14px;font-family:var(--mono,"JetBrains Mono",Consolas,monospace);color:var(--text-primary);background:var(--surface);border:1px solid var(--border);transition:border-color 0.15s, box-shadow 0.15s;outline:none;box-sizing:border-box;';
        nameInput.addEventListener('focus', function () { this.style.borderColor = 'var(--accent,#7c66e6)'; this.style.boxShadow = '0 0 0 3px rgba(124,102,230,0.15)'; });
        nameInput.addEventListener('blur', function () { this.style.borderColor = 'var(--border)'; this.style.boxShadow = 'none'; });
        body.appendChild(nameLabel);
        body.appendChild(nameInput);

        var typeLabel = document.createElement('label');
        typeLabel.style.cssText = 'display:block;font-size:13px;font-weight:500;color:var(--text-secondary);margin:16px 0 8px;';
        typeLabel.textContent = 'Type';

        var types = [
            { ext: 'html', label: 'HTML' }, { ext: 'css', label: 'CSS' },
            { ext: 'js', label: 'JavaScript' }, { ext: 'json', label: 'JSON' },
            { ext: 'py', label: 'Python' }, { ext: 'md', label: 'Markdown' },
            { ext: 'txt', label: 'Text' }, { ext: 'svg', label: 'SVG' },
            { ext: 'xml', label: 'XML' }, { ext: 'sh', label: 'Shell' }
        ];

        var typeWrap = document.createElement('div');
        typeWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
        var selectedType = 'html';

        function updatePills() {
            typeWrap.querySelectorAll('button').forEach(function (p) {
                if (p.dataset.ext === selectedType) {
                    p.style.background = 'var(--brand,#7c66e6)';
                    p.style.color = '#fff';
                    p.style.borderColor = 'var(--brand,#7c66e6)';
                } else {
                    p.style.background = 'var(--surface)';
                    p.style.color = 'var(--text-secondary)';
                    p.style.borderColor = 'var(--border)';
                }
            });
        }

        types.forEach(function (t) {
            var pill = document.createElement('button');
            pill.type = 'button';
            pill.textContent = t.label;
            pill.dataset.ext = t.ext;
            pill.style.cssText = 'padding:6px 14px;border-radius:8px;font-size:12px;font-weight:500;cursor:pointer;transition:all 0.12s;font-family:inherit;border:1px solid var(--border);background:var(--surface);color:var(--text-secondary);';
            pill.addEventListener('click', function () {
                selectedType = t.ext;
                var cur = nameInput.value.trim();
                var dot = cur.lastIndexOf('.');
                if (dot > 0) nameInput.value = cur.substring(0, dot + 1) + t.ext;
                else if (cur) nameInput.value = cur + '.' + t.ext;
                updatePills();
            });
            typeWrap.appendChild(pill);
        });
        updatePills();

        nameInput.addEventListener('input', function () {
            var val = nameInput.value.trim();
            var dot = val.lastIndexOf('.');
            if (dot > 0) {
                var ext = val.substring(dot + 1).toLowerCase();
                types.forEach(function (t) { if (t.ext === ext) { selectedType = t.ext; updatePills(); } });
            }
        });

        var footer = document.createElement('div');
        footer.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;padding:16px 24px;border-top:1px solid var(--border);';

        var cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = 'padding:8px 16px;border-radius:10px;font-size:13px;font-weight:500;color:var(--text-secondary);border:1px solid var(--border);transition:all 0.12s;background:none;cursor:pointer;font-family:inherit;';
        cancelBtn.addEventListener('click', function () { closeCreateFileModal(); });

        var createBtn = document.createElement('button');
        createBtn.type = 'button';
        createBtn.textContent = 'Create File';
        createBtn.style.cssText = 'padding:8px 20px;border-radius:10px;font-size:13px;font-weight:600;color:#fff;background:var(--brand,#7c66e6);border:none;transition:all 0.12s;cursor:pointer;font-family:inherit;box-shadow:0 4px 12px -4px rgba(110,86,207,0.5);';
        createBtn.addEventListener('mouseenter', function () { this.style.filter = 'brightness(1.1)'; this.style.transform = 'translateY(-1px)'; });
        createBtn.addEventListener('mouseleave', function () { this.style.filter = ''; this.style.transform = ''; });
        createBtn.addEventListener('click', function () {
            var fname = nameInput.value.trim();
            if (!fname) { nameInput.focus(); return; }
            if (fname.indexOf('.') === -1) fname += '.' + selectedType;
            if (getFile(proj.id, fname)) {
                nameInput.style.borderColor = 'var(--danger,#c05050)';
                nameInput.style.boxShadow = '0 0 0 3px rgba(192,80,80,0.15)';
                return;
            }
            addFile(proj.id, { name: fname, content: '' });
            closeCreateFileModal();
            if (workspacePanelOpen) { closeWorkspacePanel(); setTimeout(function () { openWorkspacePanel(); }, 50); }
        });

        nameInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); createBtn.click(); }
            if (e.key === 'Escape') closeCreateFileModal();
        });

        footer.appendChild(cancelBtn);
        footer.appendChild(createBtn);
        modal.appendChild(header);
        modal.appendChild(body);
        modal.appendChild(footer);
        overlay.appendChild(modal);
        overlay.addEventListener('click', function (e) { if (e.target === overlay) closeCreateFileModal(); });
        document.body.appendChild(overlay);
        setTimeout(function () { nameInput.focus(); }, 100);
    }

    function closeCreateFileModal() {
        var overlay = document.querySelector('.ox-create-file-modal-overlay');
        if (overlay) overlay.remove();
    }

    // ── File Viewer / Editor Modal ─────────────────────────────────────────
    function openFileViewer(fileName) {
        if (document.querySelector('.ox-file-viewer-overlay')) return;
        var proj = getActiveProject();
        if (!proj) return;
        var file = getFile(proj.id, fileName);
        if (!file) return;

        var overlay = document.createElement('div');
        overlay.className = 'ox-file-viewer-overlay';
        overlay.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:560;align-items:center;justify-content:center;animation:oxFadeIn 0.2s ease;';

        var modal = document.createElement('div');
        modal.style.cssText = 'background:var(--bg);border:1px solid var(--border);border-radius:16px;width:min(900px, calc(100vw - 48px));height:min(700px, calc(100vh - 80px));display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.5);animation:oxSlideUp 0.25s cubic-bezier(0.2,0.65,0.2,1);';

        // Header
        var header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid var(--border);flex-shrink:0;background:var(--surface);';

        var headerLeft = document.createElement('div');
        headerLeft.style.cssText = 'display:flex;align-items:center;gap:10px;min-width:0;overflow:hidden;';
        var icon = document.createElement('span');
        icon.style.cssText = 'font-size:18px;flex-shrink:0;';
        icon.textContent = fileIcon(fileName);
        var nameEl = document.createElement('span');
        nameEl.style.cssText = 'font-size:14px;font-weight:600;color:var(--text-primary);font-family:var(--mono,"JetBrains Mono",Consolas,monospace);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        nameEl.textContent = fileName;
        var sizeEl = document.createElement('span');
        sizeEl.style.cssText = 'font-size:11px;color:var(--text-muted);flex-shrink:0;';
        var contentLen = (file.content || '').length;
        sizeEl.textContent = contentLen > 1024 ? (contentLen / 1024).toFixed(1) + ' KB' : contentLen + ' B';
        headerLeft.appendChild(icon);
        headerLeft.appendChild(nameEl);
        headerLeft.appendChild(sizeEl);

        var headerRight = document.createElement('div');
        headerRight.style.cssText = 'display:flex;align-items:center;gap:6px;flex-shrink:0;';

        var copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.textContent = 'Copy';
        copyBtn.style.cssText = 'padding:6px 12px;border-radius:8px;font-size:12px;font-weight:500;color:var(--text-secondary);border:1px solid var(--border);transition:all 0.12s;background:none;cursor:pointer;font-family:inherit;';
        copyBtn.addEventListener('mouseenter', function () { this.style.background = 'var(--surface-hover)'; this.style.color = 'var(--text-primary)'; });
        copyBtn.addEventListener('mouseleave', function () { this.style.background = 'transparent'; this.style.color = 'var(--text-secondary)'; });
        copyBtn.addEventListener('click', function () {
            var ta = modal.querySelector('textarea');
            if (ta) {
                navigator.clipboard.writeText(ta.value).then(function () {
                    copyBtn.textContent = 'Copied!';
                    copyBtn.style.color = '#30a46c';
                    setTimeout(function () { copyBtn.textContent = 'Copy'; copyBtn.style.color = 'var(--text-secondary)'; }, 1500);
                }).catch(function () { ta.select(); document.execCommand('copy'); });
            }
        });

        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.style.cssText = 'width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);transition:all 0.12s;background:none;border:none;cursor:pointer;';
        closeBtn.innerHTML = svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>');
        closeBtn.querySelector('svg').style.cssText = 'width:18px;height:18px;';
        closeBtn.addEventListener('click', function () { closeFileViewer(); });

        headerRight.appendChild(copyBtn);
        headerRight.appendChild(closeBtn);
        header.appendChild(headerLeft);
        header.appendChild(headerRight);

        // Textarea (editor)
        var textarea = document.createElement('textarea');
        textarea.value = file.content || '';
        textarea.spellcheck = false;
        textarea.style.cssText = 'flex:1;border:none;outline:none;resize:none;padding:16px 20px;font-family:var(--mono,"JetBrains Mono",Consolas,monospace);font-size:13px;line-height:1.65;color:var(--text-primary);background:var(--code-bg,#0c0c0f);tab-size:2;-moz-tab-size:2;box-sizing:border-box;width:100%;';
        textarea.addEventListener('keydown', function (e) {
            if (e.key === 'Tab') {
                e.preventDefault();
                var s = this.selectionStart, end = this.selectionEnd;
                this.value = this.value.substring(0, s) + '  ' + this.value.substring(end);
                this.selectionStart = this.selectionEnd = s + 2;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveBtn.click(); }
        });

        // Footer
        var footer = document.createElement('div');
        footer.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:12px 20px;border-top:1px solid var(--border);flex-shrink:0;background:var(--surface);';

        var footerLeft = document.createElement('div');
        footerLeft.style.cssText = 'font-size:11px;color:var(--text-muted);';
        footerLeft.textContent = 'Ctrl+S to save';

        var footerRight = document.createElement('div');
        footerRight.style.cssText = 'display:flex;gap:8px;';

        var deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.textContent = 'Delete';
        deleteBtn.style.cssText = 'padding:8px 16px;border-radius:10px;font-size:13px;font-weight:500;color:var(--danger,#c05050);border:1px solid var(--danger,#c05050);transition:all 0.12s;background:none;cursor:pointer;font-family:inherit;';
        deleteBtn.addEventListener('mouseenter', function () { this.style.background = 'rgba(192,80,80,0.12)'; });
        deleteBtn.addEventListener('mouseleave', function () { this.style.background = 'none'; });
        deleteBtn.addEventListener('click', function () {
            deleteFile(proj.id, fileName);
            closeFileViewer();
            if (workspacePanelOpen) { closeWorkspacePanel(); setTimeout(function () { openWorkspacePanel(); }, 50); }
        });

        var saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.textContent = 'Save';
        saveBtn.style.cssText = 'padding:8px 20px;border-radius:10px;font-size:13px;font-weight:600;color:#fff;background:var(--brand,#7c66e6);border:none;transition:all 0.12s;cursor:pointer;font-family:inherit;box-shadow:0 4px 12px -4px rgba(110,86,207,0.5);';
        saveBtn.addEventListener('mouseenter', function () { this.style.filter = 'brightness(1.1)'; this.style.transform = 'translateY(-1px)'; });
        saveBtn.addEventListener('mouseleave', function () { this.style.filter = ''; this.style.transform = ''; });
        saveBtn.addEventListener('click', function () {
            updateFile(proj.id, fileName, textarea.value);
            saveBtn.textContent = 'Saved!';
            saveBtn.style.background = '#30a46c';
            setTimeout(function () { saveBtn.textContent = 'Save'; saveBtn.style.background = 'var(--brand,#7c66e6)'; }, 1500);
            var len = textarea.value.length;
            sizeEl.textContent = len > 1024 ? (len / 1024).toFixed(1) + ' KB' : len + ' B';
        });

        footerRight.appendChild(deleteBtn);
        footerRight.appendChild(saveBtn);
        footer.appendChild(footerLeft);
        footer.appendChild(footerRight);

        modal.appendChild(header);
        modal.appendChild(textarea);
        modal.appendChild(footer);
        overlay.appendChild(modal);
        overlay.addEventListener('click', function (e) { if (e.target === overlay) closeFileViewer(); });
        document.body.appendChild(overlay);
        setTimeout(function () { textarea.focus(); }, 100);
    }

    function closeFileViewer() {
        var overlay = document.querySelector('.ox-file-viewer-overlay');
        if (overlay) overlay.remove();
    }

    // ── Workspace Panel (upgraded) ─────────────────────────────────────────
    function openWorkspacePanel() {
        if (workspacePanelOpen) return;
        workspacePanelOpen = true;

        var proj = getActiveProject();
        if (!proj) { workspacePanelOpen = false; return; }

        var overlay = document.createElement('div');
        overlay.className = 'ox-ws-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);z-index:400;animation:oxFadeIn 0.2s ease;';

        var panel = document.createElement('div');
        panel.className = 'ox-ws-panel';
        panel.style.cssText = 'position:fixed;top:0;right:0;bottom:0;width:380px;max-width:90vw;background:var(--bg);border-left:1px solid var(--border);box-shadow:-8px 0 40px rgba(0,0,0,0.3);z-index:401;display:flex;flex-direction:column;transform:translateX(100%);transition:transform 0.3s cubic-bezier(0.2,0.65,0.2,1);';

        // Panel header
        var ph = document.createElement('div');
        ph.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border);flex-shrink:0;';
        var phTitle = document.createElement('div');
        phTitle.style.cssText = 'display:flex;align-items:center;gap:10px;min-width:0;';
        var folderSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;flex-shrink:0;color:var(--accent,#7c66e6);"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
        var nameEl = document.createElement('span');
        nameEl.style.cssText = 'font-size:15px;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        nameEl.textContent = proj.name;
        phTitle.innerHTML = folderSvg;
        phTitle.appendChild(nameEl);

        var fileCount = document.createElement('span');
        fileCount.style.cssText = 'font-size:11px;color:var(--text-muted);background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:2px 8px;flex-shrink:0;';
        fileCount.textContent = (proj.files || []).length + ' file' + ((proj.files || []).length !== 1 ? 's' : '');
        phTitle.appendChild(fileCount);

        var closePanelBtn = document.createElement('button');
        closePanelBtn.type = 'button';
        closePanelBtn.setAttribute('aria-label', 'Close');
        closePanelBtn.style.cssText = 'width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);transition:all 0.12s;background:none;border:none;cursor:pointer;flex-shrink:0;';
        closePanelBtn.innerHTML = svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>');
        closePanelBtn.querySelector('svg').style.cssText = 'width:18px;height:18px;';
        closePanelBtn.addEventListener('mouseenter', function () { this.style.background = 'var(--surface-hover)'; this.style.color = 'var(--text-primary)'; });
        closePanelBtn.addEventListener('mouseleave', function () { this.style.background = 'transparent'; this.style.color = 'var(--text-muted)'; });
        closePanelBtn.addEventListener('click', function () { closeWorkspacePanel(); });
        ph.appendChild(phTitle);
        ph.appendChild(closePanelBtn);

        // Panel body
        var pb = document.createElement('div');
        pb.style.cssText = 'flex:1;overflow-y:auto;padding:16px 20px;';

        // New file button
        var newFileBar = document.createElement('div');
        newFileBar.style.cssText = 'margin-bottom:16px;';
        var newFileBtn = document.createElement('button');
        newFileBtn.type = 'button';
        newFileBtn.style.cssText = 'width:100%;padding:10px;border-radius:10px;font-size:13px;font-weight:500;color:var(--text-secondary);border:1px dashed var(--border);transition:all 0.15s;background:none;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px;';
        newFileBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New File';
        newFileBtn.addEventListener('mouseenter', function () { this.style.borderColor = 'var(--accent,#7c66e6)'; this.style.color = 'var(--text-primary)'; this.style.background = 'var(--accent-dim,rgba(124,102,230,0.08))'; });
        newFileBtn.addEventListener('mouseleave', function () { this.style.borderColor = 'var(--border)'; this.style.color = 'var(--text-secondary)'; this.style.background = 'none'; });
        newFileBtn.addEventListener('click', function () { openCreateFileModal(); });
        newFileBar.appendChild(newFileBtn);
        pb.appendChild(newFileBar);

        // Files section
        var filesSection = document.createElement('div');
        filesSection.style.cssText = 'margin-bottom:24px;';
        var filesLabel = document.createElement('div');
        filesLabel.style.cssText = 'font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:10px;';
        filesLabel.textContent = 'Files';
        filesSection.appendChild(filesLabel);

        var filesList = document.createElement('div');
        filesList.className = 'ox-ws-files-list';
        filesList.style.cssText = 'display:flex;flex-direction:column;gap:2px;';

        if (!proj.files || proj.files.length === 0) {
            var emptyFiles = document.createElement('div');
            emptyFiles.style.cssText = 'text-align:center;padding:40px 20px;color:var(--text-muted);font-size:13px;line-height:1.6;';
            emptyFiles.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:40px;height:40px;margin:0 auto 12px;display:block;opacity:0.3;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg><div style="font-weight:500;margin-bottom:4px;">No files yet</div><div style="font-size:12px;opacity:0.7;">Click "New File" above or ask the AI to create files.</div>';
            filesList.appendChild(emptyFiles);
        } else {
            proj.files.forEach(function (f) {
                var fileItem = document.createElement('div');
                fileItem.className = 'ox-ws-file-item';
                fileItem.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;font-size:13px;color:var(--text-primary);transition:background 0.12s;cursor:pointer;border:1px solid transparent;';
                var fIcon = document.createElement('span');
                fIcon.style.cssText = 'font-size:16px;flex-shrink:0;width:24px;text-align:center;';
                fIcon.textContent = fileIcon(f.name);
                var nameSpan = document.createElement('span');
                nameSpan.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--mono,"JetBrains Mono",Consolas,monospace);font-size:12.5px;';
                nameSpan.textContent = f.name;
                var delFileBtn = document.createElement('button');
                delFileBtn.type = 'button';
                delFileBtn.setAttribute('aria-label', 'Delete file');
                delFileBtn.style.cssText = 'opacity:0;width:26px;height:26px;border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);background:transparent;border:none;cursor:pointer;transition:all 0.12s;flex-shrink:0;';
                delFileBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

                fileItem.appendChild(fIcon);
                fileItem.appendChild(nameSpan);
                fileItem.appendChild(delFileBtn);

                fileItem.addEventListener('mouseenter', function () { this.style.background = 'var(--surface-hover)'; delFileBtn.style.opacity = '1'; });
                fileItem.addEventListener('mouseleave', function () { this.style.background = 'transparent'; delFileBtn.style.opacity = '0'; });

                fileItem.addEventListener('click', function (e) {
                    if (e.target === delFileBtn || delFileBtn.contains(e.target)) return;
                    openFileViewer(f.name);
                });

                delFileBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    deleteFile(proj.id, f.name);
                    closeWorkspacePanel();
                    setTimeout(function () { openWorkspacePanel(); }, 50);
                });

                filesList.appendChild(fileItem);
            });
        }

        filesSection.appendChild(filesList);
        pb.appendChild(filesSection);

        // Metadata section
        var metaSection = document.createElement('div');
        metaSection.style.cssText = 'padding-top:16px;border-top:1px solid var(--border);';
        var metaLabel = document.createElement('div');
        metaLabel.style.cssText = 'font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:8px;';
        metaLabel.textContent = 'Details';
        metaSection.appendChild(metaLabel);

        var metaItems = [
            { label: 'Created', value: formatDate(proj.createdAt) },
            { label: 'Updated', value: formatDate(proj.updatedAt) },
            { label: 'Files', value: String((proj.files || []).length) }
        ];
        metaItems.forEach(function (m) {
            var row = document.createElement('div');
            row.style.cssText = 'display:flex;justify-content:space-between;padding:6px 0;font-size:13px;';
            row.innerHTML = '<span style="color:var(--text-muted);">' + m.label + '</span><span style="color:var(--text-secondary);">' + m.value + '</span>';
            metaSection.appendChild(row);
        });

        // Action buttons
        var actionsWrap = document.createElement('div');
        actionsWrap.style.cssText = 'margin-top:16px;display:flex;gap:8px;';

        var exitBtn = document.createElement('button');
        exitBtn.type = 'button';
        exitBtn.textContent = 'Exit Project';
        exitBtn.style.cssText = 'flex:1;padding:10px;border-radius:10px;font-size:13px;font-weight:500;color:var(--text-secondary);border:1px solid var(--border);transition:all 0.12s;background:none;cursor:pointer;font-family:inherit;text-align:center;';
        exitBtn.addEventListener('mouseenter', function () { this.style.background = 'var(--surface-hover)'; this.style.color = 'var(--text-primary)'; });
        exitBtn.addEventListener('mouseleave', function () { this.style.background = 'transparent'; this.style.color = 'var(--text-secondary)'; });
        exitBtn.addEventListener('click', function () { exitProject(); });

        var deleteProjBtn = document.createElement('button');
        deleteProjBtn.type = 'button';
        deleteProjBtn.textContent = 'Delete';
        deleteProjBtn.style.cssText = 'padding:10px 16px;border-radius:10px;font-size:13px;font-weight:500;color:var(--danger,#c05050);border:1px solid var(--danger,#c05050);transition:all 0.12s;background:none;cursor:pointer;font-family:inherit;text-align:center;';
        deleteProjBtn.addEventListener('mouseenter', function () { this.style.background = 'rgba(192,80,80,0.12)'; });
        deleteProjBtn.addEventListener('mouseleave', function () { this.style.background = 'none'; });
        deleteProjBtn.addEventListener('click', function () {
            closeWorkspacePanel();
            setTimeout(function () { deleteProjectConfirm(proj.id, proj.name); }, 350);
        });

        actionsWrap.appendChild(exitBtn);
        actionsWrap.appendChild(deleteProjBtn);
        metaSection.appendChild(actionsWrap);

        pb.appendChild(metaSection);
        panel.appendChild(ph);
        panel.appendChild(pb);
        document.body.appendChild(overlay);
        document.body.appendChild(panel);

        requestAnimationFrame(function () {
            requestAnimationFrame(function () { panel.style.transform = 'translateX(0)'; });
        });

        overlay.addEventListener('click', function () { closeWorkspacePanel(); });

        function onEsc(e) {
            if (e.key === 'Escape') {
                if (document.querySelector('.ox-file-viewer-overlay')) { closeFileViewer(); return; }
                if (document.querySelector('.ox-create-file-modal-overlay')) { closeCreateFileModal(); return; }
                if (document.querySelector('.ox-confirm-overlay')) return;
                closeWorkspacePanel();
                document.removeEventListener('keydown', onEsc);
            }
        }
        document.addEventListener('keydown', onEsc);
    }

    function closeWorkspacePanel() {
        if (!workspacePanelOpen) return;
        workspacePanelOpen = false;

        var panel = document.querySelector('.ox-ws-panel');
        var overlay = document.querySelector('.ox-ws-overlay');
        if (panel) {
            panel.style.transform = 'translateX(100%)';
            setTimeout(function () { if (panel.parentNode) panel.remove(); }, 320);
        }
        if (overlay) {
            overlay.style.opacity = '0';
            setTimeout(function () { if (overlay.parentNode) overlay.remove(); }, 200);
        }
    }

    var viewSyncQueued = false;

    function syncView() {
        if (viewSyncQueued) return;
        viewSyncQueued = true;
        requestAnimationFrame(function () {
            viewSyncQueued = false;
            injectUpdatesButton();
            injectProjectsButton();
            updateProjectView();
        });
    }

    new MutationObserver(syncView).observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
    });

    setTimeout(function () {
        injectUpdatesButton();
        injectProjectsButton();
        updateProjectView();
    }, 500);

    // ── Prevent "New Chat" button from creating a new chat item ────────
    // The button lives in the sidebar header. We always stop the React
    // onNew handler from firing so no new chat item is ever added. When a
    // project is active we also exit it so the user simply returns to the
    // chat list instead.
    document.addEventListener('click', function (e) {
        var newChatBtn = e.target.closest('.new-chat-btn');
        if (newChatBtn) {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (getActiveProject()) {
                // Clear project context
                setActiveProjectId(null);
                updateProjectView();
                closeWorkspacePanel();
                // Ensure sidebar is visible so user sees their existing chats
                var sidebar = document.querySelector('.sidebar');
                if (sidebar) sidebar.classList.remove('collapsed');
            }
        }
    }, true);

    // ── Public API ─────────────────────────────────────────────────────────
    window.__oxProjects = {
        list: loadProjects,
        getActive: getActiveProject,
        enter: enterProject,
        exit: exitProject,
        addFile: addFile,
        deleteFile: deleteFile,
        getFile: getFile,
        updateFile: updateFile,
        refresh: function () {
            renderProjectList();
            updateProjectView();
        },
        refreshWorkspace: function () {
            if (workspacePanelOpen) {
                closeWorkspacePanel();
                setTimeout(function () { openWorkspacePanel(); }, 50);
            }
        }
    };
})();
