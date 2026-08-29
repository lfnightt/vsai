// ── Version ──
fetch('/api/version').then(function(r){return r.json()}).then(function(d){
    if(d.version){
        document.getElementById('versionBadge').textContent = 'v'+d.version;
        var txt = 'VS-AI v'+d.version;
        if(d.buildDate) txt += ' · '+new Date(d.buildDate).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
        document.getElementById('footerVersion').textContent = txt;
    }
}).catch(function(){});

// ── Tag labels ──
var tagLabels = { feature: 'Feature', fix: 'Fix', update: 'Improvement', security: 'Security' };
var container = document.getElementById('updates');
var arrowSvg = '<svg class="card-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';

// ── Panel logic ──
var overlay = document.getElementById('overlay');
var panel = document.getElementById('panel');
var panelClose = document.getElementById('panelClose');
var panelDate = document.getElementById('panelDate');
var panelTag = document.getElementById('panelTag');
var panelBody = document.getElementById('panelBody');

function openPanel(u) {
    panelDate.textContent = u.date;
    panelTag.textContent = tagLabels[u.tag] || u.tag;
    panelTag.className = 'panel-tag card-tag ' + u.tag;

    var html = '<h2>' + u.title + '</h2>';
    html += '<div class="overview">' + u.full.overview + '</div>';

    if (u.full.added && u.full.added.length) {
        html += '<div class="section-title" style="color:var(--green)"><span class="dot dot-green"></span> Added</div>';
        html += '<ul class="detail-list added">';
        u.full.added.forEach(function(item) { html += '<li>' + item + '</li>'; });
        html += '</ul>';
    }
    if (u.full.changed && u.full.changed.length) {
        html += '<div class="section-title" style="color:var(--yellow)"><span class="dot dot-yellow"></span> Changed</div>';
        html += '<ul class="detail-list changed">';
        u.full.changed.forEach(function(item) { html += '<li>' + item + '</li>'; });
        html += '</ul>';
    }
    if (u.full.removed && u.full.removed.length) {
        html += '<div class="section-title" style="color:var(--red)"><span class="dot dot-red"></span> Removed</div>';
        html += '<ul class="detail-list removed">';
        u.full.removed.forEach(function(item) { html += '<li>' + item + '</li>'; });
        html += '</ul>';
    }

    panelBody.innerHTML = html;
    document.body.style.overflow = 'hidden';
    panel.classList.add('open');
    overlay.classList.add('open');
}

function closePanel() {
    panel.classList.remove('open');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
}

panelClose.addEventListener('click', closePanel);
overlay.addEventListener('click', closePanel);
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && panel.classList.contains('open')) closePanel();
});

// ── Fetch updates from API ──
fetch('/api/updates').then(function(r){return r.json()}).then(function(updates) {
    if (!updates || updates.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:80px 20px;color:var(--text-muted)"><p style="font-size:15px">No updates yet.</p><p style="font-size:13px;margin-top:4px">Check back soon!</p></div>';
        return;
    }

    // Latest bar
    var bar = document.createElement('div');
    bar.className = 'latest-bar';
    bar.innerHTML = '<span class="dot"></span> Latest: ' + updates[0].title;
    container.appendChild(bar);

    // Cards
    updates.forEach(function(u) {
        var card = document.createElement('div');
        card.className = 'card';
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.innerHTML =
            '<div class="card-header">' +
                '<span class="card-date">' + u.date + '</span>' +
                '<span class="card-tag ' + u.tag + '">' + (tagLabels[u.tag] || u.tag) + '</span>' +
            '</div>' +
            '<div class="card-title">' + u.title + '</div>' +
            '<div class="card-desc">' + u.desc + '</div>' +
            arrowSvg;
        card.addEventListener('click', function() { openPanel(u); });
        card.addEventListener('keydown', function(e) { if (e.key === 'Enter') openPanel(u); });
        container.appendChild(card);
    });
}).catch(function() {
    container.innerHTML = '<div style="text-align:center;padding:80px 20px;color:var(--text-muted)"><p style="font-size:15px">Failed to load updates.</p></div>';
});
