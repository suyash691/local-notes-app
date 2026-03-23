// All user-facing strings. Add a new locale key (e.g. 'es') to support another language.
const STRINGS = {
    en: {
        appTitle: 'Notes App',
        notes: 'Notes',
        todos: 'TODOs',
        searchNotes: "Search notes or use 'tag:tagname' for tag search...",
        searchTodos: "Search TODOs or use 'tag:tagname' for tag search...",
        to: 'to',
        clear: 'Clear',
        newNote: '+ New Note',
        addTodo: '+ Add TODO',
        todoItems: 'TODO Items',
        status: 'Status',
        priority: 'Priority',
        all: 'All',
        active: 'Active',
        completed: 'Completed',
        high: 'High',
        medium: 'Medium',
        low: 'Low',
        noNotesYet: 'No notes yet',
        createFirstNote: 'Create your first note to get started!',
        loading: 'Loading...',
        newNoteTitle: 'New Note',
        editNoteTitle: 'Edit Note',
        notePreview: 'Note Preview',
        todoDetails: 'TODO Details',
        completeTodo: 'Complete TODO',
        addNewTodo: 'Add New TODO',
        editTodo: 'Edit TODO',
        title: 'Title',
        content: 'Content',
        markdownInput: 'Markdown Input',
        preview: 'Preview',
        markdownHelp: 'Supports basic Markdown. Add a TODO heading with list items to create trackable tasks.',
        prioritySyntax: 'Priority syntax:',
        prioritySyntaxDetail: 'Start TODOs with [H]/[HIGH] or !!! (high), [M]/[MED] or !! (medium), [L]/[LOW] or ! (low)',
        priorityExample: 'Example:',
        priorityExampleDetail: '- [H] Important task, - !! Normal task, - ! Low priority task',
        tagsLabel: 'Tags (comma separated)',
        cancel: 'Cancel',
        saveNote: 'Save Note',
        edit: 'Edit',
        tags: 'Tags',
        none: 'None',
        text: 'Text',
        source: 'Source',
        created: 'Created',
        completedLabel: 'Completed',
        completionNote: 'Completion Note',
        noCompletionNote: 'No completion note provided.',
        completionComment: 'Completion Comment (optional)',
        complete: 'Complete',
        todoText: 'TODO Text',
        todoTagsLabel: 'Tags (comma-separated)',
        saveChanges: 'Save Changes',
        editTodoWarning: 'This TODO comes from a note. Editing it will update the original note as well.',
        confirmDeleteNote: 'Are you sure you want to delete this note?',
        confirmDeleteTodo: 'Are you sure you want to delete this TODO?',
        noActiveTodos: 'No active TODOs',
        noCompletedTodos: 'No completed TODOs',
        noTodosFound: 'No TODOs found',
        standaloneTodo: 'Standalone TODO',
        from: 'From',
        added: 'Added',
        editButton: 'Edit',
        deleteButton: 'Delete',
        close: 'Close',
        statusActive: 'Active',
        statusCompleted: 'Completed',
        failedLoadNotes: 'Failed to load notes',
        failedLoadTodos: 'Failed to load todos',
        failedSaveNote: 'Failed to save note',
        failedDeleteNote: 'Failed to delete note',
        failedUpdateTodo: 'Failed to update todo',
        failedCreateTodo: 'Failed to create todo',
        failedDeleteTodo: 'Failed to delete todo',
        failedLoadApp: 'Failed to load application data',
    }
};

const currentLocale = (() => {
    const lang = (navigator.language || 'en').split('-')[0];
    return STRINGS[lang] ? lang : 'en';
})();

function t(key) {
    return STRINGS[currentLocale][key] || STRINGS.en[key] || key;
}

function getDateLocale() { return navigator.language || 'en-US'; }

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString(getDateLocale(), {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
}

function formatDateLong(date) {
    return date.toLocaleDateString(getDateLocale(), {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
}

function formatDateGroup(date) {
    return date.toLocaleDateString(getDateLocale(), {
        year: 'numeric', month: 'long', day: 'numeric'
    });
}
