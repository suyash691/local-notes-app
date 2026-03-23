// app.js — uses i18n.js (t(), formatDate, formatDateLong, formatDateGroup) and modal.js (openModal, closeModalById, announce)

const API_BASE = '/api';

let notes = [];
let todos = [];
let standaloneTodos = [];
let currentEditId = null;
let currentView = 'notes';
let todoFilter = 'active';
let priorityFilter = 'all';
let pendingTodoId = null;
let pendingTodoIsStandalone = false;
let todoSearchTerm = '';
let currentEditTodoId = null;
let currentEditTodoIsStandalone = false;

// --- API ---

async function apiRequest(endpoint, options = {}) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options
    });
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${response.status}`);
    }
    return response.json();
}

async function loadNotes() {
    try {
        notes = await apiRequest('/notes');
        renderNotes();
    } catch (error) {
        showError(t('failedLoadNotes') + ': ' + error.message);
    }
}

async function loadTodos() {
    try {
        const params = todoSearchTerm ? `?search=${encodeURIComponent(todoSearchTerm)}` : '';
        const allTodos = await apiRequest(`/todos${params}`);
        todos = allTodos.filter(td => td.note_id !== null);
        standaloneTodos = allTodos.filter(td => td.note_id === null);
        if (currentView === 'todos') renderTodos();
    } catch (error) {
        showError(t('failedLoadTodos') + ': ' + error.message);
    }
}

// --- Utilities ---

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showError(message) {
    const el = document.getElementById('errorState');
    el.textContent = message;
    el.style.display = 'block';
    announce(message, 'assertive');
    setTimeout(() => { el.style.display = 'none'; }, 5000);
}

function showLoading(show) {
    document.getElementById('loadingState').style.display = show ? 'block' : 'none';
    if (show) announce(t('loading'));
}

function getPriorityOrder(p) {
    return { high: 3, medium: 2, low: 1 }[p] || 2;
}

// --- Markdown Parser ---

const PRIORITY_PATTERNS = [
    { pattern: /^\[H\]\s*/i, priority: 'high', label: 'H' },
    { pattern: /^\[HIGH\]\s*/i, priority: 'high', label: 'HIGH' },
    { pattern: /^!!!\s*/, priority: 'high', label: '!!!' },
    { pattern: /^\[M\]\s*/i, priority: 'medium', label: 'M' },
    { pattern: /^\[MED\]\s*/i, priority: 'medium', label: 'MED' },
    { pattern: /^\[MEDIUM\]\s*/i, priority: 'medium', label: 'MEDIUM' },
    { pattern: /^!!\s*/, priority: 'medium', label: '!!' },
    { pattern: /^\[L\]\s*/i, priority: 'low', label: 'L' },
    { pattern: /^\[LOW\]\s*/i, priority: 'low', label: 'LOW' },
    { pattern: /^!\s*/, priority: 'low', label: '!' }
];

function parseMarkdown(text) {
    let html = text.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]);
    const lines = html.split('\n');
    let inTodoSection = false;
    const processed = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (/^#+\s*TODO\s*$/i.test(trimmed)) { inTodoSection = true; processed.push(line); continue; }
        if (/^#+\s/.test(trimmed)) { inTodoSection = false; processed.push(line); continue; }
        if (trimmed === '') { processed.push(line); continue; }

        if (inTodoSection && /^- (.+)$/.test(trimmed)) {
            const content = trimmed.substring(2);
            let found = false;
            for (const { pattern, priority, label } of PRIORITY_PATTERNS) {
                if (pattern.test(content)) {
                    const cleanText = content.replace(pattern, '');
                    processed.push(`<li class="todo-item priority-${priority}"><span class="priority-indicator priority-${priority}" aria-label="${priority} priority">${label}</span>${cleanText}</li>`);
                    found = true;
                    break;
                }
            }
            if (!found) {
                processed.push(`<li class="todo-item priority-medium"><span class="priority-indicator priority-medium" aria-label="medium priority">M</span>${content}</li>`);
            }
            continue;
        }

        if (!inTodoSection && /^- (.+)$/.test(trimmed)) {
            processed.push(`<li>${trimmed.substring(2)}</li>`);
            continue;
        }
        processed.push(line);
    }

    html = processed.join('\n');
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/(<li class="todo-item[^>]*>.*?<\/li>(\s*<li class="todo-item[^>]*>.*?<\/li>)*)/gs, '<ul class="todo-list" role="list">$1</ul>');
    html = html.replace(/(<li>.*?<\/li>(\n<li>.*?<\/li>)*)/gm, '<ul>$1</ul>');
    html = html.replace(/```(.*?)```/gs, '<pre><code>$1</code></pre>');
    html = html.replace(/`(.+?)`/g, '<code>$1</code>');
    html = html.replace(/\n/g, '<br>');
    html = html.replace(/(<ul class="todo-list"[\s\S]*?<\/ul>)/g, m => m.replace(/<br>/g, ''));
    return html;
}

// --- Notes Rendering ---

function groupNotesByDate(notesToGroup) {
    const grouped = {};
    notesToGroup.forEach(note => {
        const date = new Date(note.date);
        const key = formatDateGroup(date);
        if (!grouped[key]) grouped[key] = { date, notes: [] };
        grouped[key].notes.push(note);
    });
    return Object.values(grouped).sort((a, b) => b.date - a.date);
}

async function renderNotes(searchTerm = '') {
    const container = document.getElementById('notesContainer');
    const emptyState = document.getElementById('emptyState');

    try {
        const params = searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : '';
        let filteredNotes = await apiRequest(`/notes${params}`);

        const dateFrom = document.getElementById('dateFrom').value;
        const dateTo = document.getElementById('dateTo').value;
        if (dateFrom) {
            const from = new Date(dateFrom); from.setHours(0, 0, 0, 0);
            filteredNotes = filteredNotes.filter(n => new Date(n.date) >= from);
        }
        if (dateTo) {
            const to = new Date(dateTo); to.setHours(23, 59, 59, 999);
            filteredNotes = filteredNotes.filter(n => new Date(n.date) <= to);
        }

        if (filteredNotes.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = currentView === 'notes' ? 'block' : 'none';
            return;
        }

        emptyState.style.display = 'none';
        const groups = groupNotesByDate(filteredNotes);

        container.innerHTML = groups.map(group => `
            <div class="date-group">
                <h3 class="date-group-header">${formatDateLong(group.date)}</h3>
                <div class="notes-grid">
                    ${group.notes.map(note => {
                        const noteTodos = todos.filter(td => td.note_id === note.id);
                        const completed = noteTodos.filter(td => td.completed).length;
                        const total = noteTodos.length;
                        return `
                        <article class="note-card"
                                 aria-label="${escapeHtml(note.title)}${total > 0 ? `, ${completed} of ${total} todos done` : ''}"
                                 onclick="previewNote(${note.id})">
                            <div class="note-header">
                                <h4 class="note-title">
                                    ${escapeHtml(note.title)}
                                    ${total > 0 ? `<span class="todo-stats" aria-hidden="true">✓ ${completed}/${total}</span>` : ''}
                                </h4>
                                <div class="note-actions">
                                    <button class="btn-icon" onclick="editNote(${note.id}); event.stopPropagation();" aria-label="${t('editButton')} ${escapeHtml(note.title)}">✏️</button>
                                    <button class="btn-icon btn-delete" onclick="deleteNote(${note.id}); event.stopPropagation();" aria-label="${t('deleteButton')} ${escapeHtml(note.title)}">🗑️</button>
                                </div>
                            </div>
                            <div class="note-content" aria-hidden="true">${parseMarkdown(note.content)}</div>
                            ${note.tags && note.tags.length ? `<div class="note-tags">${note.tags.map(tg => `<span class="tag">${escapeHtml(tg)}</span>`).join('')}</div>` : ''}
                            <div class="note-date">${formatDate(note.date)}</div>
                        </article>`;
                    }).join('')}
                </div>
            </div>`
        ).join('');
    } catch (error) {
        showError(t('failedLoadNotes') + ': ' + error.message);
    }
}

// --- TODO Rendering ---

function renderTodos() {
    const container = document.getElementById('todosContainer');
    let allTodos = [...todos, ...standaloneTodos];

    if (todoFilter === 'active') allTodos = allTodos.filter(td => !td.completed);
    else if (todoFilter === 'completed') allTodos = allTodos.filter(td => td.completed);
    if (priorityFilter !== 'all') allTodos = allTodos.filter(td => (td.priority || 'medium') === priorityFilter);

    allTodos.sort((a, b) => {
        if (todoFilter === 'completed' && a.completed_date && b.completed_date)
            return new Date(b.completed_date) - new Date(a.completed_date);
        const pd = getPriorityOrder(b.priority || 'medium') - getPriorityOrder(a.priority || 'medium');
        return pd !== 0 ? pd : new Date(b.created_date) - new Date(a.created_date);
    });

    if (allTodos.length === 0) {
        const msg = todoFilter === 'active' ? t('noActiveTodos') : todoFilter === 'completed' ? t('noCompletedTodos') : t('noTodosFound');
        container.innerHTML = `<div style="text-align:center;padding:40px;color:#999;" role="status">${msg}</div>`;
        return;
    }

    container.innerHTML = allTodos.map(todo => {
        const pri = todo.priority || 'medium';
        const priLabel = `${pri} ${t('priority').toLowerCase()}`;
        return `
        <article class="todo-card ${todo.completed ? 'completed' : ''} priority-${pri}"
                 aria-label="${escapeHtml(todo.text)}, ${priLabel}${todo.completed ? ', ' + t('completed').toLowerCase() : ''}"
                 onclick="openTodoPreview('${todo.id}')">
            <div class="todo-main">
                <input type="checkbox" class="todo-checkbox"
                    ${todo.completed ? 'checked' : ''}
                    aria-label="${todo.completed ? t('completed') : t('active')}: ${escapeHtml(todo.text)}"
                    onclick="event.stopPropagation()"
                    onchange="toggleTodo('${todo.id}', this.checked, ${!todo.note_id})">
                <div class="todo-content">
                    <div class="todo-text ${todo.completed ? 'completed' : ''}">
                        ${escapeHtml(todo.text)}
                        <span class="todo-priority priority-${pri}" aria-label="${priLabel}">${pri.toUpperCase()}</span>
                        ${todo.tags && todo.tags.length > 0 ? `<div class="todo-tags">${todo.tags.map(tg => `<span class="todo-tag">#${escapeHtml(tg)}</span>`).join(' ')}</div>` : ''}
                    </div>
                </div>
            </div>
            <div class="todo-meta">
                ${todo.note_id
                    ? `${t('from')}: <a href="#" class="todo-note-link" onclick="editNote(${todo.note_id}); event.stopPropagation(); event.preventDefault();">${escapeHtml(todo.note_title)}</a>`
                    : t('standaloneTodo')}
                • ${t('added')}: ${formatDate(todo.created_date)}
                ${todo.completed && todo.completed_date ? `• ${t('completedLabel')}: ${formatDate(todo.completed_date)}` : ''}
                ${!todo.completed ? `<button class="btn-icon" onclick="editTodo('${todo.id}', ${!todo.note_id}); event.stopPropagation();" aria-label="${t('editButton')} ${escapeHtml(todo.text)}" style="margin-left:10px;font-size:14px;">✏️</button>` : ''}
                ${!todo.completed && !todo.note_id ? `<button class="btn-icon btn-delete" onclick="deleteStandaloneTodo('${todo.id}'); event.stopPropagation();" aria-label="${t('deleteButton')} ${escapeHtml(todo.text)}" style="margin-left:10px;font-size:14px;">🗑️</button>` : ''}
            </div>
            ${todo.completed && todo.completion_comment ? `<div class="todo-completion">💬 <span class="todo-completion-text">${escapeHtml(todo.completion_comment)}</span></div>` : ''}
        </article>`;
    }).join('');
}

// --- Note Modals ---

function openNewNoteModal() {
    currentEditId = null;
    document.getElementById('modalTitle').textContent = t('newNoteTitle');
    document.getElementById('noteForm').reset();
    document.getElementById('preview').innerHTML = '';
    openModal('noteModal');
}

async function editNote(id) {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    currentEditId = id;
    document.getElementById('modalTitle').textContent = t('editNoteTitle');
    document.getElementById('noteTitle').value = note.title;
    document.getElementById('noteContent').value = note.content;
    document.getElementById('noteTags').value = note.tags ? note.tags.join(', ') : '';
    openModal('noteModal');
    updatePreview();
}

function closeModal() {
    closeModalById('noteModal');
    currentEditId = null;
}

async function previewNote(id) {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    currentEditId = id;
    document.getElementById('previewModalTitle').textContent = note.title;
    document.getElementById('previewContent').innerHTML = parseMarkdown(note.content);
    document.getElementById('previewTagsList').textContent = note.tags && note.tags.length ? note.tags.join(', ') : t('none');
    openModal('previewModal');
}

function closePreviewModal() {
    closeModalById('previewModal');
    currentEditId = null;
}

function editFromPreview() {
    const noteId = currentEditId;
    closePreviewModal();
    if (noteId) editNote(noteId);
}

async function saveNote(event) {
    event.preventDefault();
    const title = document.getElementById('noteTitle').value;
    const content = document.getElementById('noteContent').value;
    const tags = document.getElementById('noteTags').value.split(',').map(s => s.trim()).filter(Boolean);

    try {
        showLoading(true);
        if (currentEditId) {
            await apiRequest(`/notes/${currentEditId}`, { method: 'PUT', body: JSON.stringify({ title, content, tags }) });
        } else {
            await apiRequest('/notes', { method: 'POST', body: JSON.stringify({ title, content, tags }) });
        }
        await loadNotes();
        await loadTodos();
        closeModal();
        announce(currentEditId ? 'Note updated' : 'Note created');
    } catch (error) {
        showError(t('failedSaveNote') + ': ' + error.message);
    } finally {
        showLoading(false);
    }
}

async function deleteNote(id) {
    if (!confirm(t('confirmDeleteNote'))) return;
    try {
        showLoading(true);
        await apiRequest(`/notes/${id}`, { method: 'DELETE' });
        await loadNotes();
        await loadTodos();
        announce('Note deleted');
    } catch (error) {
        showError(t('failedDeleteNote') + ': ' + error.message);
    } finally {
        showLoading(false);
    }
}

function updatePreview() {
    document.getElementById('preview').innerHTML = parseMarkdown(document.getElementById('noteContent').value);
}

// --- Tab Switching ---

function switchTab(tab, el) {
    currentView = tab;
    localStorage.setItem('notesApp_currentTab', tab);

    document.querySelectorAll('.tab').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
    });
    el.classList.add('active');
    el.setAttribute('aria-selected', 'true');

    document.getElementById('notesView').style.display = tab === 'notes' ? 'block' : 'none';
    document.getElementById('todosView').style.display = tab === 'todos' ? 'block' : 'none';

    if (tab === 'notes') renderNotes();
    else renderTodos();
}

// --- TODO Filters ---

function filterTodos(filter, el) {
    todoFilter = filter;
    document.querySelectorAll('.todo-filter-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
    });
    el.classList.add('active');
    el.setAttribute('aria-pressed', 'true');
    renderTodos();
}

function filterByPriority(priority, el) {
    priorityFilter = priority;
    document.querySelectorAll('.priority-filter-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
    });
    el.classList.add('active');
    el.setAttribute('aria-pressed', 'true');
    renderTodos();
}

// --- TODO Actions ---

async function toggleTodo(todoId, completed, isStandalone) {
    if (completed) {
        pendingTodoId = todoId;
        pendingTodoIsStandalone = isStandalone;
        openModal('todoModal');
    } else {
        try {
            await apiRequest(`/todos/${todoId}`, { method: 'PUT', body: JSON.stringify({ completed: false, completionComment: null }) });
            await loadTodos();
            announce('TODO reopened');
        } catch (error) {
            showError(t('failedUpdateTodo') + ': ' + error.message);
        }
    }
}

function closeTodoModal() {
    closeModalById('todoModal');
    document.getElementById('completionComment').value = '';
    pendingTodoId = null;
    pendingTodoIsStandalone = false;
}

async function confirmCompleteTodo() {
    try {
        const comment = document.getElementById('completionComment').value;
        await apiRequest(`/todos/${pendingTodoId}`, { method: 'PUT', body: JSON.stringify({ completed: true, completionComment: comment }) });
        await loadTodos();
        closeTodoModal();
        announce('TODO completed');
    } catch (error) {
        showError(t('failedUpdateTodo') + ': ' + error.message);
    }
}

function openNewTodoModal() { openModal('newTodoModal'); }
function closeNewTodoModal() {
    closeModalById('newTodoModal');
    document.getElementById('newTodoForm').reset();
}

async function saveNewTodo(event) {
    event.preventDefault();
    const text = document.getElementById('newTodoText').value;
    const priority = document.getElementById('newTodoPriority').value;
    const tagsInput = document.getElementById('newTodoTags').value;
    const tags = tagsInput ? tagsInput.split(',').map(s => s.trim()).filter(Boolean) : [];

    try {
        showLoading(true);
        await apiRequest('/todos', { method: 'POST', body: JSON.stringify({ text, priority, tags }) });
        await loadTodos();
        closeNewTodoModal();
        announce('TODO created');
    } catch (error) {
        showError(t('failedCreateTodo') + ': ' + error.message);
    } finally {
        showLoading(false);
    }
}

async function deleteStandaloneTodo(todoId) {
    if (!confirm(t('confirmDeleteTodo'))) return;
    try {
        showLoading(true);
        await apiRequest(`/todos/${todoId}`, { method: 'DELETE' });
        await loadTodos();
        announce('TODO deleted');
    } catch (error) {
        showError(t('failedDeleteTodo') + ': ' + error.message);
    } finally {
        showLoading(false);
    }
}

function editTodo(todoId, isStandalone) {
    currentEditTodoId = todoId;
    currentEditTodoIsStandalone = isStandalone;
    const allTodos = [...todos, ...standaloneTodos];
    const todo = allTodos.find(td => td.id === todoId);
    if (!todo) return;

    document.getElementById('editTodoText').value = todo.text;
    document.getElementById('editTodoPriority').value = todo.priority || 'medium';
    document.getElementById('editTodoWarning').style.display = todo.note_id ? 'block' : 'none';
    openModal('editTodoModal');
}

function closeEditTodoModal() {
    closeModalById('editTodoModal');
    document.getElementById('editTodoForm').reset();
    currentEditTodoId = null;
    currentEditTodoIsStandalone = false;
}

async function saveEditedTodo(event) {
    event.preventDefault();
    const newText = document.getElementById('editTodoText').value;
    const newPriority = document.getElementById('editTodoPriority').value;

    try {
        showLoading(true);
        if (currentEditTodoIsStandalone) {
            await apiRequest(`/todos/${currentEditTodoId}`, { method: 'PUT', body: JSON.stringify({ text: newText, priority: newPriority }) });
        } else {
            await apiRequest(`/todos/${currentEditTodoId}/edit`, { method: 'PUT', body: JSON.stringify({ text: newText, priority: newPriority }) });
            notes = await apiRequest('/notes');
            renderNotes();
        }
        await loadTodos();
        closeEditTodoModal();
        announce('TODO updated');
    } catch (error) {
        showError(t('failedUpdateTodo') + ': ' + error.message);
    } finally {
        showLoading(false);
    }
}

// --- TODO Preview ---

function openTodoPreview(todoId) {
    const allTodos = [...todos, ...standaloneTodos];
    const todo = allTodos.find(td => td.id === todoId);
    if (!todo) return;

    document.getElementById('todoPreviewText').textContent = todo.text;
    document.getElementById('todoPreviewPriority').innerHTML = `<span class="todo-priority priority-${todo.priority || 'medium'}">${(todo.priority || 'medium').toUpperCase()}</span>`;
    document.getElementById('todoPreviewStatus').innerHTML = todo.completed
        ? `<span style="color:#2e7d32;font-weight:bold;">✅ ${t('statusCompleted')}</span>`
        : `<span style="color:#9a5b00;font-weight:bold;">⏳ ${t('statusActive')}</span>`;

    const tagsEl = document.getElementById('todoPreviewTags');
    if (todo.tags && todo.tags.length > 0) {
        tagsEl.innerHTML = `<dt>${t('tags')}</dt><dd>${todo.tags.map(tg => `<span class="todo-tag">#${escapeHtml(tg)}</span>`).join(' ')}</dd>`;
        tagsEl.style.display = 'contents';
    } else {
        tagsEl.style.display = 'none';
    }

    document.getElementById('todoPreviewSource').innerHTML = todo.note_id
        ? `<a href="#" class="todo-note-link" onclick="editNote(${todo.note_id}); closeTodoPreview(); event.preventDefault();">📝 ${escapeHtml(todo.note_title)}</a>`
        : `📋 ${t('standaloneTodo')}`;
    document.getElementById('todoPreviewCreated').textContent = formatDate(todo.created_date);

    const completionDetails = document.getElementById('todoPreviewCompletionDetails');
    if (todo.completed) {
        completionDetails.style.display = 'contents';
        document.getElementById('todoPreviewCompleted').textContent = todo.completed_date ? formatDate(todo.completed_date) : t('completedLabel');
        document.getElementById('todoPreviewCompletionComment').textContent = todo.completion_comment || t('noCompletionNote');
    } else {
        completionDetails.style.display = 'none';
    }

    openModal('todoPreviewModal');
}

function closeTodoPreview() { closeModalById('todoPreviewModal'); }

// --- Date Filter ---

function clearDateFilter() {
    document.getElementById('dateFrom').value = '';
    document.getElementById('dateTo').value = '';
    document.getElementById('searchInput').value = '';
    renderNotes();
}

// --- Init ---

function restoreSavedTab() {
    const saved = localStorage.getItem('notesApp_currentTab');
    const tab = (saved === 'notes' || saved === 'todos') ? saved : 'notes';
    currentView = tab;

    document.querySelectorAll('.tab').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
    });
    const btn = document.querySelector(`.tab[data-tab="${tab}"]`);
    if (btn) {
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
    }

    document.getElementById('notesView').style.display = tab === 'notes' ? 'block' : 'none';
    document.getElementById('todosView').style.display = tab === 'todos' ? 'block' : 'none';
}

async function initializeApp() {
    try {
        showLoading(true);
        await loadNotes();
        await loadTodos();
        if (currentView === 'notes') renderNotes();
        else renderTodos();
    } catch (error) {
        showError(t('failedLoadApp'));
    } finally {
        showLoading(false);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('searchInput').addEventListener('input', function () { renderNotes(this.value); });
    document.getElementById('todoSearchInput').addEventListener('input', function () { todoSearchTerm = this.value; loadTodos(); });
    document.getElementById('dateFrom').addEventListener('change', () => { renderNotes(document.getElementById('searchInput').value); });
    document.getElementById('dateTo').addEventListener('change', () => { renderNotes(document.getElementById('searchInput').value); });
});

restoreSavedTab();
initializeApp();
