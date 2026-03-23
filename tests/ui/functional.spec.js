import { test, expect } from '@playwright/test';

test.describe('Notes CRUD', () => {
    test('creates, previews, edits, and deletes a note', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('h1')).toContainText('Notes App');

        await page.click('button:has-text("+ New Note")');
        await expect(page.locator('#noteModal')).toHaveClass(/active/);
        await page.fill('#noteTitle', 'Playwright Note');
        await page.fill('#noteContent', '## TODO\n- [H] Important task\n- Regular task');
        await page.fill('#noteTags', 'test, playwright');
        await page.click('button:has-text("Save Note")');
        await expect(page.locator('#noteModal')).not.toHaveClass(/active/);

        await expect(page.locator('.note-card', { hasText: 'Playwright Note' }).first()).toBeVisible();
        await expect(page.locator('.tag', { hasText: 'test' }).first()).toBeVisible();

        await page.locator('.note-card', { hasText: 'Playwright Note' }).first().click();
        await expect(page.locator('#previewModal')).toHaveClass(/active/);
        await expect(page.locator('#previewContent')).toContainText('Important task');
        await page.click('#previewModal button:has-text("Edit")');

        await expect(page.locator('#noteModal')).toHaveClass(/active/);
        await page.fill('#noteTitle', 'Updated Note');
        await page.click('button:has-text("Save Note")');
        await expect(page.locator('.note-card', { hasText: 'Updated Note' }).first()).toBeVisible();

        page.on('dialog', d => d.accept());
        await page.locator('.note-card:has-text("Updated Note") .btn-delete').first().click();
        await expect(page.locator('.note-card', { hasText: 'Updated Note' })).not.toBeVisible();
    });
});

test.describe('TODOs CRUD', () => {
    test('creates, completes, edits, and deletes a standalone todo', async ({ page }) => {
        await page.goto('/');
        await page.click('[data-tab="todos"]');

        // Create
        await page.click('button:has-text("+ Add TODO")');
        await page.fill('#newTodoText', 'PW TODO');
        await page.selectOption('#newTodoPriority', 'high');
        await page.click('#newTodoModal button:has-text("Add TODO")');
        await expect(page.locator('.todo-card', { hasText: 'PW TODO' }).first()).toBeVisible();

        // Edit
        await page.locator('.todo-card:has-text("PW TODO") button[aria-label*="Edit"]').first().click();
        await page.fill('#editTodoText', 'Edited TODO');
        await page.click('button:has-text("Save Changes")');
        await expect(page.locator('.todo-card', { hasText: 'Edited TODO' }).first()).toBeVisible();

        // Complete — click the checkbox directly, not the card
        await page.locator('.todo-card:has-text("Edited TODO") input[type="checkbox"]').first().check();
        await expect(page.locator('#todoModal')).toHaveClass(/active/);
        await page.fill('#completionComment', 'All done');
        await page.click('#todoModal button:has-text("Complete")');

        // Switch to completed filter
        await page.locator('fieldset.filter-group button:has-text("Completed")').click();
        await expect(page.locator('.todo-card', { hasText: 'Edited TODO' }).first()).toBeVisible();

        // Back to active, create and delete
        await page.locator('fieldset.filter-group .todo-filter-btn:has-text("Active")').click();
        await page.click('button:has-text("+ Add TODO")');
        await page.fill('#newTodoText', 'Delete me');
        await page.click('#newTodoModal button:has-text("Add TODO")');

        page.on('dialog', d => d.accept());
        await page.locator('.todo-card:has-text("Delete me") .btn-delete').first().click();
        await expect(page.locator('.todo-card', { hasText: 'Delete me' })).not.toBeVisible();
    });
});

test.describe('Search and Filters', () => {
    test('text and tag search filters notes', async ({ page }) => {
        await page.goto('/');

        // Create a note with unique content
        await page.click('button:has-text("+ New Note")');
        await page.fill('#noteTitle', 'UniqueSearchable');
        await page.fill('#noteContent', 'xyzfindme content');
        await page.fill('#noteTags', 'uniqtag');
        await page.click('button:has-text("Save Note")');
        await expect(page.locator('.note-card', { hasText: 'UniqueSearchable' }).first()).toBeVisible();

        // Text search
        await page.fill('#searchInput', 'xyzfindme');
        await expect(page.locator('.note-card', { hasText: 'UniqueSearchable' }).first()).toBeVisible();
        await page.fill('#searchInput', 'nonexistent_xyz');
        await expect(page.locator('.note-card')).toHaveCount(0);

        // Tag search
        await page.fill('#searchInput', 'tag:uniqtag');
        await expect(page.locator('.note-card', { hasText: 'UniqueSearchable' }).first()).toBeVisible();
    });

    test('priority filter works on todos', async ({ page }) => {
        await page.goto('/');
        await page.click('[data-tab="todos"]');

        await page.click('button:has-text("+ Add TODO")');
        await page.fill('#newTodoText', 'HighPriUnique');
        await page.selectOption('#newTodoPriority', 'high');
        await page.click('#newTodoModal button:has-text("Add TODO")');

        await page.locator('.priority-filter-btn:has-text("Low")').click();
        await expect(page.locator('.todo-card', { hasText: 'HighPriUnique' })).not.toBeVisible();

        await page.locator('.priority-filter-btn:has-text("High")').click();
        await expect(page.locator('.todo-card', { hasText: 'HighPriUnique' }).first()).toBeVisible();
    });
});

test.describe('Modal Behavior', () => {
    test('Escape closes modal', async ({ page }) => {
        await page.goto('/');
        await page.click('button:has-text("+ New Note")');
        await expect(page.locator('#noteModal')).toHaveClass(/active/);
        await page.keyboard.press('Escape');
        await expect(page.locator('#noteModal')).not.toHaveClass(/active/);
    });

    test('focus is trapped inside modal', async ({ page }) => {
        await page.goto('/');
        await page.click('button:has-text("+ New Note")');
        await expect(page.locator('#noteModal')).toHaveClass(/active/);

        for (let i = 0; i < 15; i++) await page.keyboard.press('Tab');
        const focused = await page.evaluate(() => document.activeElement?.closest('#noteModal') !== null);
        expect(focused).toBe(true);
    });

    test('note cards are clickable', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('.note-card');
        await page.locator('.note-card').first().click();
        await expect(page.locator('#previewModal')).toHaveClass(/active/);
    });
});

test.describe('Tab Persistence', () => {
    test('remembers selected tab across reloads', async ({ page }) => {
        await page.goto('/');
        await page.click('[data-tab="todos"]');
        await expect(page.locator('#todosView')).toBeVisible();
        await page.reload();
        await expect(page.locator('#todosView')).toBeVisible();
    });
});
