// ============================================================================
// Projects System — sidebar button, dropdown, create modal, project view,
// workspace panel, and localStorage CRUD.
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

    // ── File CRUD ──────────────────────────────────────────────────────────
    function addFile(projectId, file) {
        var projects = loadProjects();
        for (var i = 0; i < projects.length; i++) {
            if (projects[i].id === projectId) {
                projects[i].files.push(file);
                projects[i].updatedAt = new Date().toISOString();
                saveProjects(projects);
                return true;
            }
        }
        return false;
    }

    function deleteFile(projectId, fileName) {
        var projects = loadProjects();
        for (var i = 0; i < projects.length; i++) {
            if (projects[i].id === projectId) {
                projects[i].files = projects[i].files.filter(function(f) { return f.name !== fileName; });
                projects[i].updatedAt = new Date().toISOString();
                saveProjects(projects);
                return true;
            }
        }
        return false;
    }

    function updateFile(projectId, fileName, content) {
        var projects = loadProjects();
        for (var i = 0; i < projects.length; i++) {
            if (projects[i].id === projectId) {
                for (var j = 0; j < projects[i].files.length; j++) {
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

    function svg(d) {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
    }

    // ── State ──────────────────────────────────────────────────────────────
    var dropdownOpen = false;
    var workspacePanelOpen = false;

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

        // Already injected?
        if (chatList.querySelector('.ox-projects-btn-item')) return true;

        // ── List item wrapper ──────────────────────────────────────────────
        var item = document.createElement('li');
        item.className = 'ox-projects-btn-item chat-item';
        item.style.cssText = 'list-style:none;margin:0;padding:0;position:relative;';

        // ── Main button ────────────────────────────────────────────────────
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ox-projects-btn chat-item-btn';
        btn.setAttribute('aria-label', 'Projects');
        btn.title = 'Projects';
        btn.style.cssText = 'width:100%;background:transparent;border:none;padding:12px 14px;cursor:pointer;color:var(--text-primary,#e4e4e7);border-radius:10px;transition:background 0.15s,color 0.15s;display:flex;align-items:center;gap:12px;font-size:14px;font-weight:500;font-family:inherit;text-align:left;outline:none;';

        var PROJECT_ICON = '<svg class="chat-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;flex-shrink:0;color:var(--text-muted,#a1a1aa);"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
        var CHEVRON = '<svg class="ox-projects-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;flex-shrink:0;color:var(--text-muted,#a1a1aa);transition:transform 0.2s;margin-left:auto;"><polyline points="6 9 12 15 18 9"/></svg>';
        btn.innerHTML = PROJECT_ICON + '<span class="chat-item-title" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Projects</span>' + CHEVRON;

        // Hover/active states matching chat-item
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

        // ── Dropdown container ──────────────────────────────────────────────
        var dropdown = document.createElement('div');
        dropdown.className = 'ox-projects-dropdown';
        dropdown.style.cssText = 'overflow:hidden;max-height:0;transition:max-height 0.3s ease, opacity 0.2s ease;opacity:0;';

        var list = document.createElement('ul');
        list.className = 'ox-projects-list';
        list.style.cssText = 'list-style:none;margin:0;padding:4px 10px 8px;display:flex;flex-direction:column;gap:2px;';
        dropdown.appendChild(list);

        // "New Project" button at bottom of dropdown
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

        // Insert after the Updates button (which is prepended first)
        // The Updates button uses .prepend, so it's at the top. We want Projects below it.
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

            // Hover
            btn.addEventListener('mouseenter', function () {
                if (proj.id !== activeId) {
                    this.style.background = 'var(--bg-hover,rgba(110,86,207,0.08))';
                }
                delBtn.style.opacity = '1';
            });
            btn.addEventListener('mouseleave', function () {
                if (proj.id !== activeId) {
                    this.style.background = 'transparent';
                }
                delBtn.style.opacity = '0';
            });

            // Click to enter project
            btn.addEventListener('click', function (e) {
                if (e.target === delBtn || delBtn.contains(e.target)) return;
                e.preventDefault();
                e.stopPropagation();
                enterProject(proj.id);
            });

            // Delete
            delBtn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                deleteProject(proj.id);
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

    function enterProject(id) {
        setActiveProjectId(id);
        dropdownOpen = false;
        var dropdown = document.querySelector('.ox-projects-dropdown');
        var chevron = document.querySelector('.ox-projects-chevron');
        if (dropdown) {
            dropdown.style.maxHeight = '0';
            dropdown.style.opacity = '0';
        }
        if (chevron) chevron.style.transform = 'rotate(0deg)';
        updateProjectView();
    }

    function exitProject() {
        setActiveProjectId(null);
        updateProjectView();
        closeWorkspacePanel();
    }

    // ── Project View (empty state title + workspace menu button) ────────
    function updateProjectView() {
        var proj = getActiveProject();

        // Empty state title
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

        // Workspace menu button (three dots) — floating top-right in chat area
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

        // Show/hide workspace menu button
        updateWorkspaceMenuVisibility();
    }

    function updateWorkspaceMenuVisibility() {
        var proj = getActiveProject();
        var existingBtn = document.querySelector('.ox-workspace-menu-btn');
        // Button visibility is handled by updateProjectView — if project is active, button exists
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
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

        // Header
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
        closeBtn.addEventListener('mouseenter', function () {
            this.style.background = 'var(--surface-hover)';
            this.style.color = 'var(--text-primary)';
        });
        closeBtn.addEventListener('mouseleave', function () {
            this.style.background = 'transparent';
            this.style.color = 'var(--text-muted)';
        });
        closeBtn.addEventListener('click', function () { closeModal(); });
        header.appendChild(h3);
        header.appendChild(closeBtn);

        // Body
        var body = document.createElement('div');
        body.style.cssText = 'padding:20px 24px;';

        var label = document.createElement('label');
        label.style.cssText = 'display:block;font-size:13px;font-weight:500;color:var(--text-secondary);margin-bottom:8px;';
        label.textContent = 'Project Name';
        var input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'e.g. My Awesome Project';
        input.style.cssText = 'width:100%;padding:10px 14px;border-radius:10px;font-size:14px;font-family:inherit;color:var(--text-primary);background:var(--surface);border:1px solid var(--border);transition:border-color 0.15s, box-shadow 0.15s;outline:none;box-sizing:border-box;';
        input.addEventListener('focus', function () {
            this.style.borderColor = 'var(--accent,#7c66e6)';
            this.style.boxShadow = '0 0 0 3px rgba(124,102,230,0.15)';
        });
        input.addEventListener('blur', function () {
            this.style.borderColor = 'var(--border)';
            this.style.boxShadow = 'none';
        });
        body.appendChild(label);
        body.appendChild(input);

        // Footer
        var footer = document.createElement('div');
        footer.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;padding:16px 24px;border-top:1px solid var(--border);';

        var cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = 'padding:8px 16px;border-radius:10px;font-size:13px;font-weight:500;color:var(--text-secondary);border:1px solid var(--border);transition:all 0.12s;background:none;cursor:pointer;font-family:inherit;';
        cancelBtn.addEventListener('mouseenter', function () {
            this.style.background = 'var(--surface-hover)';
            this.style.color = 'var(--text-primary)';
        });
        cancelBtn.addEventListener('mouseleave', function () {
            this.style.background = 'transparent';
            this.style.color = 'var(--text-secondary)';
        });
        cancelBtn.addEventListener('click', function () { closeModal(); });

        var createBtn = document.createElement('button');
        createBtn.type = 'button';
        createBtn.textContent = 'Create';
        createBtn.style.cssText = 'padding:8px 20px;border-radius:10px;font-size:13px;font-weight:600;color:#fff;background:var(--brand,#7c66e6);border:none;transition:all 0.12s;cursor:pointer;font-family:inherit;box-shadow:0 4px 12px -4px rgba(110,86,207,0.5);';
        createBtn.addEventListener('mouseenter', function () {
            this.style.filter = 'brightness(1.1)';
            this.style.transform = 'translateY(-1px)';
        });
        createBtn.addEventListener('mouseleave', function () {
            this.style.filter = '';
            this.style.transform = '';
        });
        createBtn.addEventListener('click', function () {
            var name = input.value.trim();
            if (!name) { input.focus(); return; }
            createProject(name);
            closeModal();
        });

        // Enter key
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                var name = input.value.trim();
                if (!name) return;
                createProject(name);
                closeModal();
            }
            if (e.key === 'Escape') closeModal();
        });

        footer.appendChild(cancelBtn);
        footer.appendChild(createBtn);

        modal.appendChild(header);
        modal.appendChild(body);
        modal.appendChild(footer);
        overlay.appendChild(modal);

        // Close on overlay click
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) closeModal();
        });

        document.body.appendChild(overlay);
        setTimeout(function () { input.focus(); }, 100);
    }

    function closeModal() {
        var overlay = document.querySelector('.ox-create-modal-overlay');
        if (overlay) overlay.remove();
    }

    // ── Create File Modal ───────────────────────────────────────────────────
    function openCreateFileModal() {
        if (document.querySelector('.ox-create-file-modal-overlay')) return;

        var overlay = document.createElement('div');
        overlay.className = 'ox-create-file-modal-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:500;display:flex;align-items:center;justify-content:center;animation:oxFadeIn 0.2s ease;';

        var modal = document.createElement('div');
        modal.className = 'ox-create-file-modal';
        modal.style.cssText = 'background:var(--bg);border:1px solid var(--border);border-radius:16px;width:420px;max-width:90vw;box-shadow:0 20px 60px rgba(0,0,0,0.5);animation:oxSlideUp 0.25s ease;';

        // Header
        var header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid var(--border);';
        var h3 = document.createElement('h3');
        h3.style.cssText = 'font-size:16px;font-weight:600;margin:0;color:var(--text-primary);';
        h3.textContent = 'Create New File';
        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.style.cssText = 'width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);transition:all 0.12s;background:none;border:none;cursor:pointer;';
        closeBtn.innerHTML = svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>');
        closeBtn.querySelector('svg').style.cssText = 'width:18px;height:18px;';
        closeBtn.addEventListener('mouseenter', function () { this.style.background = 'var(--surface-hover)'; this.style.color = 'var(--text-primary)'; });
        closeBtn.addEventListener('mouseleave', function () { this.style.background = 'transparent'; this.style.color = 'var(--text-muted)'; });
        closeBtn.addEventListener('click', function () { closeCreateFileModal(); });
        header.appendChild(h3);
        header.appendChild(closeBtn);

        // Body
        var body = document.createElement('div');
        body.style.cssText = 'padding:20px 24px;';

        var nameLabel = document.createElement('label');
        nameLabel.style.cssText = 'display:block;font-size:13px;font-weight:500;color:var(--text-secondary);margin-bottom:8px;';
        nameLabel.textContent = 'File Name';
        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.placeholder = 'e.g. index.html';
        nameInput.style.cssText = 'width:100%;padding:10px 14px;border-radius:10px;font-size:14px;font-family:inherit;color:var(--text-primary);background:var(--surface);border:1px solid var(--border);transition:border-color 0.15s, box-shadow 0.15s;outline:none;box-sizing:border-box;';
        nameInput.addEventListener('focus', function () { this.style.borderColor = 'var(--accent,#7c66e6)'; this.style.boxShadow = '0 0 0 3px rgba(124,102,230,0.15)'; });
        nameInput.addEventListener('blur', function () { this.style.borderColor = 'var(--border)'; this.style.boxShadow = 'none'; });
        body.appendChild(nameLabel);
        body.appendChild(nameInput);

        // Footer
        var footer = document.createElement('div');
        footer.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;padding:16px 24px;border-top:1px solid var(--border);';
        var cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = 'padding:8px 16px;border-radius:10px;font-size:13px;font-weight:500;color:var(--text-secondary);border:1px solid var(--border);transition:all 0.12s;background:none;cursor:pointer;font-family:inherit;';
        cancelBtn.addEventListener('mouseenter', function () { this.style.background = 'var(--surface-hover)'; this.style.color = 'var(--text-primary)'; });
        cancelBtn.addEventListener('mouseleave', function () { this.style.background = 'transparent'; this.style.color = 'var(--text-secondary)'; });
        cancelBtn.addEventListener('click', function () { closeCreateFileModal(); });

        var createBtn = document.createElement('button');
        createBtn.type = 'button';
        createBtn.textContent = 'Create File';
        createBtn.style.cssText = 'padding:8px 20px;border-radius:10px;font-size:13px;font-weight:600;color:#fff;background:var(--accent,#7a7a8a);border:none;transition:all 0.12s;cursor:pointer;font-family:inherit;';
        createBtn.addEventListener('mouseenter', function () { this.style.filter = 'brightness(1.1)'; this.style.transform = 'translateY(-1px)'; });
        createBtn.addEventListener('mouseleave', function () { this.style.filter = ''; this.style.transform = ''; });
        createBtn.addEventListener('click', function () {
            var name = nameInput.value.trim();
            if (!name) { nameInput.focus(); return; }
            var proj = getActiveProject();
            if (!proj) return;
            // Check if file already exists
            var exists = proj.files.some(function(f) { return f.name === name; });
            if (exists) { nameInput.style.borderColor = '#e5484d'; nameInput.focus(); return; }
            addFile(proj.id, { name: name, content: '', type: 'file', createdAt: new Date().toISOString() });
            closeCreateFileModal();
            closeWorkspacePanel();
            setTimeout(openWorkspacePanel, 100);
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

    // ── File Viewer Modal ──────────────────────────────────────────────────
    function openFileViewer(fileName) {
        var proj = getActiveProject();
        if (!proj) return;
        var file = proj.files.find(function(f) { return f.name === fileName; });
        if (!file) return;

        var overlay = document.createElement('div');
        overlay.className = 'ox-file-viewer-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:500;display:flex;align-items:center;justify-content:center;animation:oxFadeIn 0.2s ease;';

        var modal = document.createElement('div');
        modal.style.cssText = 'background:var(--bg);border:1px solid var(--border);border-radius:16px;width:700px;max-width:92vw;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.5);animation:oxSlideUp 0.25s ease;';

        // Header
        var header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid var(--border);flex-shrink:0;';
        var h3 = document.createElement('h3');
        h3.style.cssText = 'font-size:16px;font-weight:600;margin:0;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        h3.textContent = file.name;
        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.style.cssText = 'width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);transition:all 0.12s;background:none;border:none;cursor:pointer;';
        closeBtn.innerHTML = svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>');
        closeBtn.querySelector('svg').style.cssText = 'width:18px;height:18px;';
        closeBtn.addEventListener('mouseenter', function () { this.style.background = 'var(--surface-hover)'; this.style.color = 'var(--text-primary)'; });
        closeBtn.addEventListener('mouseleave', function () { this.style.background = 'transparent'; this.style.color = 'var(--text-muted)'; });
        closeBtn.addEventListener('click', function () { closeFileViewer(); });
        header.appendChild(h3);
        header.appendChild(closeBtn);

        // Body - textarea editor
        var textarea = document.createElement('textarea');
        textarea.value = file.content || '';
        textarea.style.cssText = 'flex:1;width:100%;min-height:400px;padding:20px 24px;border:none;background:var(--surface);color:var(--text-primary);font-family:var(--mono);font-size:14px;line-height:1.6;resize:none;outline:none;border-radius:0;';
        textarea.spellcheck = false;

        // Footer
        var footer = document.createElement('div');
        footer.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:16px 24px;border-top:1px solid var(--border);flex-shrink:0;';

        var deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.textContent = 'Delete';
        deleteBtn.style.cssText = 'padding:8px 16px;border-radius:10px;font-size:13px;font-weight:500;color:var(--danger,#e5484d);border:1px solid rgba(229,72,77,0.3);transition:all 0.12s;background:none;cursor:pointer;font-family:inherit;';
        deleteBtn.addEventListener('mouseenter', function () { this.style.background = 'rgba(229,72,77,0.1)'; });
        deleteBtn.addEventListener('mouseleave', function () { this.style.background = 'transparent'; });
        deleteBtn.addEventListener('click', function () {
            if (confirm('Delete file "' + file.name + '"?')) {
                deleteFile(proj.id, file.name);
                closeFileViewer();
                closeWorkspacePanel();
                setTimeout(openWorkspacePanel, 100);
            }
        });

        var saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.textContent = 'Save';
        saveBtn.style.cssText = 'padding:8px 20px;border-radius:10px;font-size:13px;font-weight:600;color:#fff;background:var(--accent,#7a7a8a);border:none;transition:all 0.12s;cursor:pointer;font-family:inherit;';
        saveBtn.addEventListener('mouseenter', function () { this.style.filter = 'brightness(1.1)'; });
        saveBtn.addEventListener('mouseleave', function () { this.style.filter = ''; });
        saveBtn.addEventListener('click', function () {
            updateFile(proj.id, file.name, textarea.value);
            saveBtn.textContent = 'Saved!';
            saveBtn.style.background = '#30a46c';
            setTimeout(function () { saveBtn.textContent = 'Save'; saveBtn.style.background = ''; }, 1500);
        });

        footer.appendChild(deleteBtn);
        footer.appendChild(saveBtn);
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

    // ── Workspace Panel (slides from right) ────────────────────────────────
    function openWorkspacePanel() {
        if (workspacePanelOpen) return;
        workspacePanelOpen = true;

        var proj = getActiveProject();
        if (!proj) { workspacePanelOpen = false; return; }

        // Overlay
        var overlay = document.createElement('div');
        overlay.className = 'ox-ws-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);z-index:400;animation:oxFadeIn 0.2s ease;';

        // Panel
        var panel = document.createElement('div');
        panel.className = 'ox-ws-panel';
        panel.style.cssText = 'position:fixed;top:0;right:0;bottom:0;width:360px;max-width:90vw;background:var(--bg);border-left:1px solid var(--border);box-shadow:-8px 0 40px rgba(0,0,0,0.3);z-index:401;display:flex;flex-direction:column;transform:translateX(100%);transition:transform 0.3s cubic-bezier(0.2,0.65,0.2,1);';

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

        var closePanelBtn = document.createElement('button');
        closePanelBtn.type = 'button';
        closePanelBtn.setAttribute('aria-label', 'Close');
        closePanelBtn.style.cssText = 'width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);transition:all 0.12s;background:none;border:none;cursor:pointer;flex-shrink:0;';
        closePanelBtn.innerHTML = svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>');
        closePanelBtn.querySelector('svg').style.cssText = 'width:18px;height:18px;';
        closePanelBtn.addEventListener('mouseenter', function () {
            this.style.background = 'var(--surface-hover)';
            this.style.color = 'var(--text-primary)';
        });
        closePanelBtn.addEventListener('mouseleave', function () {
            this.style.background = 'transparent';
            this.style.color = 'var(--text-muted)';
        });
        closePanelBtn.addEventListener('click', function () { closeWorkspacePanel(); });
        ph.appendChild(phTitle);
        ph.appendChild(closePanelBtn);

        // Panel body
        var pb = document.createElement('div');
        pb.style.cssText = 'flex:1;overflow-y:auto;padding:20px;';

        var filesSection = document.createElement('div');
        filesSection.style.cssText = 'margin-bottom:24px;';
        var filesHeader = document.createElement('div');
        filesHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;';
        var filesLabel = document.createElement('div');
        filesLabel.style.cssText = 'font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);';
        filesLabel.textContent = 'Files (' + proj.files.length + ')';
        var newFileBtn = document.createElement('button');
        newFileBtn.type = 'button';
        newFileBtn.style.cssText = 'display:flex;align-items:center;gap:4px;padding:4px 10px;border-radius:8px;font-size:12px;font-weight:500;color:var(--accent,#7a7a8a);background:var(--accent-dim);border:1px solid transparent;cursor:pointer;transition:all 0.12s;font-family:inherit;';
        newFileBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> New File';
        newFileBtn.addEventListener('mouseenter', function () { this.style.background = 'var(--accent)'; this.style.color = '#fff'; });
        newFileBtn.addEventListener('mouseleave', function () { this.style.background = 'var(--accent-dim)'; this.style.color = 'var(--accent,#7a7a8a)'; });
        newFileBtn.addEventListener('click', function () { openCreateFileModal(); });
        filesHeader.appendChild(filesLabel);
        filesHeader.appendChild(newFileBtn);
        filesSection.appendChild(filesHeader);

        var filesList = document.createElement('div');
        filesList.className = 'ox-ws-files-list';
        filesList.style.cssText = 'display:flex;flex-direction:column;gap:2px;';

        if (proj.files.length === 0) {
            var emptyFiles = document.createElement('div');
            emptyFiles.style.cssText = 'text-align:center;padding:40px 20px;color:var(--text-muted);font-size:13px;line-height:1.6;';
            emptyFiles.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:40px;height:40px;margin:0 auto 12px;display:block;opacity:0.3;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg><div style="font-weight:500;margin-bottom:4px;">No files yet</div><div style="font-size:12px;opacity:0.7;">AI can create files in your project.</div>';
            filesList.appendChild(emptyFiles);
        } else {
            proj.files.forEach(function (f) {
                var fileItem = document.createElement('div');
                fileItem.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;font-size:13px;color:var(--text-primary);transition:background 0.12s;cursor:pointer;';
                var icon = f.type === 'folder' ? '📁' : '📄';
                fileItem.innerHTML = '<span style="font-size:16px;">' + icon + '</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(f.name) + '</span>';
                // Click to view file
                fileItem.addEventListener('click', function () { openFileViewer(f.name); });
                fileItem.addEventListener('mouseenter', function () { this.style.background = 'var(--surface-hover)'; });
                fileItem.addEventListener('mouseleave', function () { this.style.background = 'transparent'; });
                filesList.appendChild(fileItem);
            });
        }

        filesSection.appendChild(filesList);
        pb.appendChild(filesSection);

        // Metadata section
        var metaSection = document.createElement('div');
        metaSection.style.cssText = 'padding-top:16px;border-top:1px solid var(--border);';
        var metaLabel = document.createElement('div');
        metaLabel.style.cssText = 'font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:8px;';
        metaLabel.textContent = 'Details';
        metaSection.appendChild(metaLabel);

        var metaItems = [
            { label: 'Created', value: formatDate(proj.createdAt) },
            { label: 'Updated', value: formatDate(proj.updatedAt) },
            { label: 'Files', value: String(proj.files.length) }
        ];
        metaItems.forEach(function (m) {
            var row = document.createElement('div');
            row.style.cssText = 'display:flex;justify-content:space-between;padding:6px 0;font-size:13px;';
            row.innerHTML = '<span style="color:var(--text-muted);">' + m.label + '</span><span style="color:var(--text-secondary);">' + m.value + '</span>';
            metaSection.appendChild(row);
        });

        // Exit project button
        var exitBtn = document.createElement('button');
        exitBtn.type = 'button';
        exitBtn.textContent = 'Exit Project';
        exitBtn.style.cssText = 'width:100%;margin-top:16px;padding:10px;border-radius:10px;font-size:13px;font-weight:500;color:var(--text-secondary);border:1px solid var(--border);transition:all 0.12s;background:none;cursor:pointer;font-family:inherit;text-align:center;';
        exitBtn.addEventListener('mouseenter', function () {
            this.style.background = 'var(--surface-hover)';
            this.style.color = 'var(--text-primary)';
        });
        exitBtn.addEventListener('mouseleave', function () {
            this.style.background = 'transparent';
            this.style.color = 'var(--text-secondary)';
        });
        exitBtn.addEventListener('click', function () {
            exitProject();
        });
        metaSection.appendChild(exitBtn);

        pb.appendChild(metaSection);

        panel.appendChild(ph);
        panel.appendChild(pb);
        document.body.appendChild(overlay);
        document.body.appendChild(panel);

        // Animate in
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                panel.style.transform = 'translateX(0)';
            });
        });

        // Close on overlay click
        overlay.addEventListener('click', function () { closeWorkspacePanel(); });

        // Escape
        function onEsc(e) {
            if (e.key === 'Escape') {
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

    function formatDate(iso) {
        if (!iso) return '—';
        var d = new Date(iso);
        var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
    }

    // ── Observer: inject button + maintain view ────────────────────────────
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

    // Initial injection
    setTimeout(function () {
        injectUpdatesButton();
        injectProjectsButton();
        updateProjectView();
    }, 500);

    // ── Exit project when New Chat button is clicked ────────────────────
    document.addEventListener('click', function (e) {
        var newChatBtn = e.target.closest('.new-chat-btn');
        if (newChatBtn && getActiveProject()) {
            exitProject();
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
        updateFile: updateFile,
        refresh: function () {
            renderProjectList();
            updateProjectView();
        }
    };
})();
