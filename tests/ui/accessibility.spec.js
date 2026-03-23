import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility (axe-core)', () => {
    test('homepage passes WCAG 2.1 AA', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('.note-card, #emptyState');
        const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze();
        expect(results.violations).toEqual([]);
    });

    test('todos view passes WCAG 2.1 AA', async ({ page }) => {
        await page.goto('/');
        await page.click('[data-tab="todos"]');
        await page.waitForSelector('#todosContainer');
        const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze();
        expect(results.violations).toEqual([]);
    });

    test('note edit modal passes WCAG 2.1 AA', async ({ page }) => {
        await page.goto('/');
        await page.click('button:has-text("+ New Note")');
        await page.waitForSelector('#noteModal.active');
        await page.waitForTimeout(500);
        const results = await new AxeBuilder({ page })
            .include('#noteModal .modal-content')
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze();
        expect(results.violations).toEqual([]);
    });

    test('todo preview modal passes WCAG 2.1 AA', async ({ page }) => {
        await page.goto('/');
        await page.click('[data-tab="todos"]');
        await page.click('button:has-text("+ Add TODO")');
        await page.fill('#newTodoText', 'A11y test');
        await page.click('#newTodoModal button:has-text("Add TODO")');
        // Click the card area (not the checkbox) to open preview
        await page.locator('.todo-card', { hasText: 'A11y test' }).first().click();
        await page.waitForSelector('#todoPreviewModal.active');
        await page.waitForTimeout(500);

        const results = await new AxeBuilder({ page })
            .include('#todoPreviewModal .modal-content')
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze();
        expect(results.violations).toEqual([]);
    });
});

test.describe('Accessibility (manual checks)', () => {
    test('all modals have proper ARIA attributes', async ({ page }) => {
        await page.goto('/');
        const modals = page.locator('[role="dialog"]');
        const count = await modals.count();
        expect(count).toBe(6);

        for (let i = 0; i < count; i++) {
            const modal = modals.nth(i);
            await expect(modal).toHaveAttribute('aria-modal', 'true');
            await expect(modal).toHaveAttribute('aria-hidden', 'true');
            const labelledBy = await modal.getAttribute('aria-labelledby');
            expect(labelledBy).toBeTruthy();
            await expect(page.locator(`#${labelledBy}`)).toBeAttached();
        }
    });

    test('tabs have correct ARIA roles', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('[role="tablist"]')).toHaveCount(1);
        expect(await page.locator('[role="tab"]').count()).toBe(2);
        await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
    });

    test('skip link is present and works', async ({ page }) => {
        await page.goto('/');
        const skipLink = page.locator('.skip-link');
        await expect(skipLink).toBeAttached();
        await expect(skipLink).toHaveAttribute('href', '#mainContent');
        await expect(page.locator('#mainContent')).toBeAttached();
    });

    test('filter buttons have aria-pressed', async ({ page }) => {
        await page.goto('/');
        await page.click('[data-tab="todos"]');
        await expect(page.locator('.todo-filter-btn[aria-pressed="true"]')).toHaveCount(1);
        await expect(page.locator('.priority-filter-btn[aria-pressed="true"]')).toHaveCount(1);
    });

    test('error region has role=alert', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#errorState')).toHaveAttribute('role', 'alert');
        await expect(page.locator('#errorState')).toHaveAttribute('aria-live', 'assertive');
    });

    test('screen reader announcer exists', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#srAnnouncer')).toBeAttached();
        await expect(page.locator('#srAnnouncer')).toHaveAttribute('aria-live', 'polite');
    });

    test('emoji buttons have accessible labels', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('.note-card');
        const editBtns = page.locator('.note-card .btn-icon:not(.btn-delete)');
        const count = await editBtns.count();
        expect(count).toBeGreaterThan(0);
        for (let i = 0; i < count; i++) {
            const label = await editBtns.nth(i).getAttribute('aria-label');
            expect(label).toBeTruthy();
            expect(label.length).toBeGreaterThan(2);
        }
    });
});
