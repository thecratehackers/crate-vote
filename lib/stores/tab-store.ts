// ============================================================================
// Tab Store
// ============================================================================
// CRUD for Tab entities. Tabs are stored in a global hash, indexed by ID,
// with a secondary slug -> id index for URL lookups.
// ============================================================================

import { Redis } from '@upstash/redis';
import {
    Tab,
    TabSettings,
    DEFAULT_TAB_SETTINGS,
    KEYS,
    MAIN_TAB_ID,
    MAIN_TAB_SLUG,
} from '../entities';

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const redis = new Redis({
    url: REDIS_URL || 'https://placeholder.upstash.io',
    token: REDIS_TOKEN || 'placeholder',
});

// ----------------------------------------------------------------------------
// Slug normalization & validation
// ----------------------------------------------------------------------------

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const RESERVED_SLUGS = new Set([
    'admin', 'api', 'export', 'archive', 'tabs', 'tab',
    'login', 'logout', 'auth', 'static', 'public', 'assets',
]);

export function normalizeSlug(input: string): string {
    return input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
}

export function validateSlug(slug: string): { valid: boolean; error?: string } {
    if (!slug) return { valid: false, error: 'Slug is required.' };
    if (RESERVED_SLUGS.has(slug)) {
        return { valid: false, error: `"${slug}" is a reserved slug.` };
    }
    if (!SLUG_PATTERN.test(slug)) {
        return { valid: false, error: 'Slug must be lowercase letters, numbers, and dashes (2-40 chars).' };
    }
    return { valid: true };
}

// ----------------------------------------------------------------------------
// Tab CRUD
// ----------------------------------------------------------------------------

export async function getTab(tabId: string): Promise<Tab | null> {
    try {
        const data = await redis.hget<Tab>(KEYS.tabsIndex, tabId);
        return data || null;
    } catch (error) {
        console.error('Failed to get tab:', error);
        return null;
    }
}

export async function getTabBySlug(slug: string): Promise<Tab | null> {
    try {
        const tabId = await redis.hget<string>(KEYS.tabsBySlug, slug);
        if (!tabId) return null;
        return getTab(tabId);
    } catch (error) {
        console.error('Failed to get tab by slug:', error);
        return null;
    }
}

export async function listTabs(): Promise<Tab[]> {
    try {
        const all = await redis.hgetall<Record<string, Tab>>(KEYS.tabsIndex);
        if (!all) return [];
        // Main tab first, then by createdAt asc
        return Object.values(all).sort((a, b) => {
            if (a.isMainTab && !b.isMainTab) return -1;
            if (!a.isMainTab && b.isMainTab) return 1;
            return a.createdAt - b.createdAt;
        });
    } catch (error) {
        console.error('Failed to list tabs:', error);
        return [];
    }
}

export interface CreateTabInput {
    slug: string;
    name: string;
    description?: string;
    themeColor?: string;
    createdBy: string;
    settings?: Partial<TabSettings>;
    isMainTab?: boolean;
    id?: string;        // Allow caller to specify ID (used for the main tab)
}

export async function createTab(input: CreateTabInput): Promise<{
    success: boolean;
    tab?: Tab;
    error?: string;
}> {
    const slug = normalizeSlug(input.slug);
    const validation = validateSlug(slug);
    if (!validation.valid) {
        return { success: false, error: validation.error };
    }

    const existingId = await redis.hget<string>(KEYS.tabsBySlug, slug);
    if (existingId) {
        return { success: false, error: `A tab with slug "${slug}" already exists.` };
    }

    const tabId = input.id || generateId();
    const tab: Tab = {
        id: tabId,
        slug,
        name: input.name.slice(0, 80),
        description: input.description?.slice(0, 280),
        themeColor: input.themeColor,
        isMainTab: !!input.isMainTab,
        createdAt: Date.now(),
        createdBy: input.createdBy,
        settings: { ...DEFAULT_TAB_SETTINGS, ...(input.settings || {}) },
    };

    try {
        await Promise.all([
            redis.hset(KEYS.tabsIndex, { [tabId]: tab }),
            redis.hset(KEYS.tabsBySlug, { [slug]: tabId }),
        ]);
        return { success: true, tab };
    } catch (error) {
        console.error('Failed to create tab:', error);
        return { success: false, error: 'Could not create tab. Please try again.' };
    }
}

export async function updateTab(
    tabId: string,
    updates: Partial<Pick<Tab, 'name' | 'description' | 'themeColor' | 'settings'>>
): Promise<{ success: boolean; tab?: Tab; error?: string }> {
    const existing = await getTab(tabId);
    if (!existing) return { success: false, error: 'Tab not found.' };

    const updated: Tab = {
        ...existing,
        ...(updates.name !== undefined && { name: updates.name.slice(0, 80) }),
        ...(updates.description !== undefined && { description: updates.description?.slice(0, 280) }),
        ...(updates.themeColor !== undefined && { themeColor: updates.themeColor }),
        ...(updates.settings && { settings: { ...existing.settings, ...updates.settings } }),
    };

    try {
        await redis.hset(KEYS.tabsIndex, { [tabId]: updated });
        return { success: true, tab: updated };
    } catch (error) {
        console.error('Failed to update tab:', error);
        return { success: false, error: 'Could not update tab.' };
    }
}

export async function deleteTab(tabId: string): Promise<{ success: boolean; error?: string }> {
    const tab = await getTab(tabId);
    if (!tab) return { success: false, error: 'Tab not found.' };
    if (tab.isMainTab) return { success: false, error: 'The main tab cannot be deleted.' };

    try {
        await Promise.all([
            redis.hdel(KEYS.tabsIndex, tabId),
            redis.hdel(KEYS.tabsBySlug, tab.slug),
            redis.del(KEYS.tabShowsList(tabId)),
            redis.del(KEYS.tabCurrentShow(tabId)),
            redis.del(KEYS.tabShowCounter(tabId)),
        ]);
        // Note: we intentionally do NOT cascade-delete shows here. Use a
        // separate admin "purge tab data" action that the show store handles.
        return { success: true };
    } catch (error) {
        console.error('Failed to delete tab:', error);
        return { success: false, error: 'Could not delete tab.' };
    }
}

// ----------------------------------------------------------------------------
// Main tab bootstrap
// ----------------------------------------------------------------------------
// Ensures the canonical "main" tab entity exists. Idempotent - safe to call
// on every request to a route that needs it.
// ----------------------------------------------------------------------------

let mainTabBootstrapped = false;

export async function ensureMainTab(): Promise<Tab> {
    if (mainTabBootstrapped) {
        const cached = await getTab(MAIN_TAB_ID);
        if (cached) return cached;
    }

    const existing = await getTab(MAIN_TAB_ID);
    if (existing) {
        mainTabBootstrapped = true;
        return existing;
    }

    const result = await createTab({
        id: MAIN_TAB_ID,
        slug: MAIN_TAB_SLUG,
        name: 'Hackathons',
        description: 'The original Hackathons show.',
        isMainTab: true,
        createdBy: 'system',
    });

    if (result.success && result.tab) {
        mainTabBootstrapped = true;
        return result.tab;
    }

    // If the creation failed because slug already exists (race), refetch
    const fallback = await getTab(MAIN_TAB_ID);
    if (fallback) return fallback;

    throw new Error('Failed to bootstrap main tab');
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function generateId(): string {
    // Short, URL-safe, time-prefixed ID. Good enough for tabs/shows.
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `${ts}${rand}`;
}

export { generateId };
